# Feelvie API: Frontend Integration Guide

How to call the Feelvie backend from the app. This file is updated whenever an endpoint, request shape or response shape changes.

_Last updated: 2026-10-03_

## Base URL

| Environment | Base URL                       |
| ----------- | ------------------------------ |
| Local       | `http://localhost:5000/api/v1` |

All requests and responses use JSON. Send `Content-Type: application/json` on every request with a body.

## Response format

Every response uses the same envelope, so you can check `success` first.

**Success**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP sent successfully",
  "data": { }
}
```

**Error**

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "details": ["body.phone must be a valid phone number (10-15 digits, optional +)"]
}
```

`details` appears only on validation errors. Show `message` to the user.

## Login with phone and OTP

### Flow

1. The user enters a phone number. Call **Get OTP**.
2. Show the OTP screen. The OTP is valid for `data.expiresInSeconds` (300 seconds).
3. The user enters the 6-digit OTP. Call **Verify OTP**.
4. Handle the result:
   - **200**: save `data.token` securely and store `data.user`. The user is logged in.
   - **404**: the OTP was correct but there is no account for this number. Show the "account not found" state. A signup endpoint is not available yet.
   - **400**: wrong or expired OTP. Show `message`, which includes the attempts remaining.
   - **429**: too many wrong attempts. Ask the user to request a new OTP.

> **Testing:** OTPs are currently mocked. The code is always `123456` and no SMS is sent.

### Phone number format

- Send the number as a string with the country code, for example `"+919876543210"`.
- Spaces, dashes and brackets are allowed and get stripped: `"+91 98765-43210"` works.
- After removing those characters it must be 10 to 15 digits with an optional leading `+`.
- The backend returns the cleaned number in responses. Use that value when calling Verify OTP.

### Get OTP

`POST /auth/get-otp`

Request:

```json
{ "phone": "+919876543210" }
```

Response `200`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP sent successfully",
  "data": { "phone": "+919876543210", "expiresInSeconds": 300 }
}
```

Calling this again sends a new OTP and invalidates the old one. Use it for a "Resend OTP" button.

### Verify OTP

`POST /auth/verify-otp`

Request. The `otp` must be a **string** of 6 digits, not a number:

```json
{ "phone": "+919876543210", "otp": "123456" }
```

Response `200`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP verified, login successful",
  "data": {
    "user": {
      "_id": "6ac0c8425e44be9e0d7a5146",
      "phone": "+919876543210",
      "name": "Test User",
      "email": "test@feelvie.app",
      "role": "user",
      "isActive": true,
      "lastLoginAt": "2026-10-03T09:17:54.100Z",
      "createdAt": "2026-10-03T09:17:54.036Z",
      "updatedAt": "2026-10-03T09:17:54.100Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

`name` and `email` are optional and may be missing.

Error responses:

| Status | `message`                                                  | What to do                        |
| ------ | ---------------------------------------------------------- | --------------------------------- |
| 400    | `Validation failed`                                        | Fix the input, see `details`      |
| 400    | `Invalid OTP. N attempt(s) remaining`                      | Let the user retry                |
| 400    | `OTP expired or not requested. Please request a new OTP`   | Send the user back to Get OTP     |
| 403    | `Account is deactivated`                                   | Show an account-disabled message  |
| 404    | `OTP matched, account not found`                           | Show the "no account" state       |
| 429    | `Too many invalid attempts. Please request a new OTP`      | Force a new Get OTP               |

## Using the token

The token is valid for **120 days**. Send it on every protected request:

```
Authorization: Bearer <token>
```

If any request returns **401**, the token is missing, invalid or expired. Clear the stored token and send the user to login.

## Endpoints

| Method | Path               | Auth          | Description                   |
| ------ | ------------------ | ------------- | ----------------------------- |
| GET    | `/health`          | none          | Server health check           |
| POST   | `/auth/get-otp`    | none          | Send an OTP to a phone number |
| POST   | `/auth/verify-otp` | none          | Verify OTP, returns user and token |
| GET    | `/auth/me`         | Bearer token  | Current logged-in user        |
| GET    | `/users`           | admin         | List users, paginated         |
| GET    | `/users/:id`       | self or admin | Get one user                  |
| PATCH  | `/users/:id`       | self or admin | Update name and email         |
| DELETE | `/users/:id`       | admin         | Delete a user                 |

### Get current user

`GET /auth/me` returns the same `user` object as Verify OTP in `data`. Call it on app start to check whether the saved token still works.

### Update profile

`PATCH /users/:id` with any of:

```json
{ "name": "New Name", "email": "new@feelvie.app" }
```

Other fields are ignored. Returns the updated user. An email already used by another account returns **409**.

### List users (admin)

`GET /users?page=1&limit=20`. `limit` is capped at 100. Response `data`:

```json
{ "items": [ /* users */ ], "total": 42, "page": 1, "pages": 3 }
```

## Status codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| 200  | Success                                         |
| 201  | Created                                         |
| 400  | Bad input, or wrong or expired OTP              |
| 401  | Not logged in, or token invalid or expired      |
| 403  | Logged in but not allowed                       |
| 404  | Not found                                       |
| 409  | Duplicate value, such as an email already in use |
| 429  | Rate limited or too many OTP attempts           |
| 500  | Server error                                    |

## Rate limits

| Endpoints              | Limit per IP               |
| ---------------------- | -------------------------- |
| `get-otp`, `verify-otp` | 20 requests every 15 minutes |
| Everything else        | 100 requests every 15 minutes |

When limited you get **429**. Disable the Resend OTP button for a while instead of retrying in a loop.

## Changelog for frontend

| Date       | Change                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| 2026-10-03 | Phone + OTP login added. Email and password login removed. Token lifetime is now 120 days. |
