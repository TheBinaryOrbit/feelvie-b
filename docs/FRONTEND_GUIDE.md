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
| GET    | `/users/:id`       | Bearer token, own id only | Get my profile    |
| PATCH  | `/users/:id`       | Bearer token, own id only | Update name and email |
| GET    | `/addresses`       | Bearer token  | List my addresses, default first |
| POST   | `/addresses`       | Bearer token  | Add an address                |
| GET    | `/addresses/:id`   | Bearer token  | Get one of my addresses       |
| PATCH  | `/addresses/:id`   | Bearer token  | Update an address             |
| PATCH  | `/addresses/:id/default` | Bearer token | Make an address the default |
| DELETE | `/addresses/:id`   | Bearer token  | Delete an address             |
| GET    | `/plans`           | none          | Subscription plans for the pricing page |
| GET    | `/credit-packs`    | none          | Credit packs                  |

### Get current user

`GET /auth/me` returns the same `user` object as Verify OTP in `data`. Call it on app start to check whether the saved token still works.

### Update profile

`PATCH /users/:id` with any of:

```json
{ "name": "New Name", "email": "new@feelvie.app" }
```

Other fields are ignored. Returns the updated user. An email already used by another account returns **409**. Using any id other than your own returns **403**.

Admin endpoints are not part of the app API. They are documented separately in `docs/ADMIN_GUIDE.md`.

## Addresses

A user can save up to **10** addresses. All address endpoints need the token and only ever return the logged-in user's own addresses.

### Address fields

| Field          | Required | Type    | Rules / example                                    |
| -------------- | -------- | ------- | -------------------------------------------------- |
| `label`        | Yes      | string  | `"home"`, `"work"` or `"other"`                    |
| `fullName`     | Yes      | string  | Recipient name, max 100 chars                      |
| `phone`        | Yes      | string  | Same rules as the login phone. `"+91 98765-43210"` is saved as `"+919876543210"` |
| `addressLine1` | Yes      | string  | Flat or house number and building, max 200 chars   |
| `addressLine2` | No       | string  | Street or area, max 200 chars                      |
| `landmark`     | No       | string  | Max 100 chars                                      |
| `city`         | Yes      | string  |                                                    |
| `state`        | Yes      | string  |                                                    |
| `pincode`      | Yes      | string  | 6 digits, cannot start with 0. `"411001"`          |
| `country`      | No       | string  | Defaults to `"India"`                              |
| `location`     | No       | object  | `{ "lat": 18.52, "lng": 73.85 }`. Send both or neither |
| `isDefault`    | No       | boolean | `true` makes this the default. `false` is ignored  |

The server also returns `_id`, `user`, `createdAt` and `updatedAt`. Any other fields you send are ignored.

### Default address rules

- The first address a user adds becomes the default automatically.
- Only one address is the default at a time. Making one default unsets the previous one.
- To change the default, call `PATCH /addresses/:id/default`, or send `isDefault: true` when creating or updating.
- If the user deletes the default, the most recently added remaining address becomes the default.
- The list endpoint returns the default first, then the newest. Use `data[0]` as the preselected address.

### List addresses

`GET /addresses`. Response `data` is an array. It is empty when the user has no addresses.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "_id": "6ac0d1f25e44be9e0d7a5201",
      "user": "6ac0c8425e44be9e0d7a5146",
      "label": "home",
      "fullName": "Rahul Sharma",
      "phone": "+919876543210",
      "addressLine1": "Flat 302, Sunrise Apartments",
      "addressLine2": "MG Road",
      "landmark": "Near City Mall",
      "city": "Pune",
      "state": "Maharashtra",
      "pincode": "411001",
      "country": "India",
      "location": { "lat": 18.52, "lng": 73.85 },
      "isDefault": true,
      "createdAt": "2026-10-03T10:00:00.000Z",
      "updatedAt": "2026-10-03T10:00:00.000Z"
    }
  ]
}
```

### Add an address

`POST /addresses`

```json
{
  "label": "home",
  "fullName": "Rahul Sharma",
  "phone": "+919876543210",
  "addressLine1": "Flat 302, Sunrise Apartments",
  "addressLine2": "MG Road",
  "landmark": "Near City Mall",
  "city": "Pune",
  "state": "Maharashtra",
  "pincode": "411001",
  "location": { "lat": 18.52, "lng": 73.85 },
  "isDefault": true
}
```

Returns **201** with the saved address in `data`.

### Update an address

`PATCH /addresses/:id`. Send only the fields that changed:

```json
{ "landmark": "Opposite Central Park", "pincode": "411002" }
```

Returns **200** with the full updated address.

### Make an address the default

`PATCH /addresses/:id/default` with no body. Returns **200** with the address, now `isDefault: true`.

### Delete an address

`DELETE /addresses/:id`. Returns **200** with `data: null`. Refetch the list afterwards, because the default may have moved.

### Address errors

| Status | `message`                                  | What to do                           |
| ------ | ------------------------------------------ | ------------------------------------ |
| 400    | `Validation failed`                        | Show the messages in `details` next to the form |
| 400    | `You can save at most 10 addresses`        | Ask the user to delete one first     |
| 400    | `Invalid value for _id: ...`               | The id in the URL is malformed       |
| 404    | `Address not found`                        | Deleted, or not this user's address. Refetch the list |

Example validation error for an empty form:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "details": [
    "State is required",
    "City is required",
    "Address line 1 is required",
    "Phone number is required",
    "Full name is required",
    "Label must be one of: home, work, other",
    "Pincode must be a valid 6-digit Indian PIN code"
  ]
}
```

## Subscription plans

`GET /plans` needs no token, so the pricing page can be shown before login. Only active plans are returned, cheapest first.

Optional filters:
- `audience`: `B2B` or `B2C`
- `billingCycle`: `monthly` or `yearly`

For example, `GET /plans?audience=B2C&billingCycle=yearly`.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "_id": "6ac0e1a05079aaf00c50e701",
      "name": "Pro Monthly",
      "description": "For regular users",
      "audience": "B2C",
      "billingCycle": "monthly",
      "originalPriceInr": 999,
      "offerPriceInr": 499,
      "creditsPerMonth": 100,
      "isActive": true,
      "createdAt": "2026-10-03T10:00:00.000Z",
      "updatedAt": "2026-10-03T10:00:00.000Z"
    }
  ]
}
```

How to show a plan:
- **Price:** show `offerPriceInr` as the price and `originalPriceInr` struck through. The customer is charged `offerPriceInr` every cycle.
- **Credits:** `creditsPerMonth` is granted every month, for yearly plans too. Each month's credits expire at the end of that month and do not roll over.

## Credit packs

`GET /credit-packs` needs no token. It returns active packs, cheapest first.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "_id": "6ac0e2b15079aaf00c50e7a0",
      "name": "Starter Pack",
      "description": "Extra credits",
      "credits": 50,
      "priceInr": 199,
      "validityDays": 90,
      "isActive": true,
      "createdAt": "2026-10-03T10:00:00.000Z",
      "updatedAt": "2026-10-03T10:00:00.000Z"
    }
  ]
}
```

- **Expiry:** credits from a pack expire `validityDays` days after purchase.
- **Who can buy:** only users with an active subscription can buy a pack.

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
| 2026-10-03 | Added `GET /plans` and `GET /credit-packs` for the pricing page. |
| 2026-10-03 | The `role` field was removed from the user object. `GET /users` and `DELETE /users/:id` moved to the admin API. `/users/:id` now only works with your own id. |
| 2026-10-03 | Addresses added: users can save up to 10 addresses with one default. See the Addresses section. |
| 2026-10-03 | Phone + OTP login added. Email and password login removed. Token lifetime is now 120 days. |
