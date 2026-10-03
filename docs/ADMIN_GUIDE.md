# Feelvie Admin API Guide

How to use the admin API to manage Feelvie. This guide is for admin panel developers and operators. The app API used by end users is documented separately in `FRONTEND_GUIDE.md`.

This file is updated whenever an admin endpoint, request shape or response shape changes.

_Last updated: 2026-10-03_

## Base URL

| Environment | Base URL                             |
| ----------- | ------------------------------------ |
| Local       | `http://localhost:5000/api/v1/admin` |

All requests and responses use JSON, with the same envelope as the app API:

```json
{ "success": true, "statusCode": 200, "message": "Success", "data": { } }
```

```json
{ "success": false, "statusCode": 400, "message": "Validation failed", "details": ["..."] }
```

## Creating an admin

There is no signup endpoint. Create admins from the server with the CLI script:

```bash
npm run create-admin -- --email admin@feelvie.app --password "a-strong-password" --name "Ops Admin"
```

- The password must be at least 8 characters. It is stored as a bcrypt hash.
- The email is stored lowercase and must be unique.
- To create the first admin, run this once after deploying.

## Authentication

### Log in

`POST /auth/login`

```json
{ "email": "admin@feelvie.app", "password": "a-strong-password" }
```

Response `200`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "admin": {
      "_id": "6ac0d1ae5079aaf00c50e634",
      "email": "admin@feelvie.app",
      "name": "Ops Admin",
      "isActive": true,
      "lastLoginAt": "2026-10-03T10:00:00.000Z",
      "createdAt": "2026-10-03T09:00:00.000Z",
      "updatedAt": "2026-10-03T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

| Status | `message`                     | Meaning                                  |
| ------ | ----------------------------- | ---------------------------------------- |
| 400    | `Validation failed`           | Email or password missing                |
| 401    | `Invalid email or password`   | Wrong credentials                        |
| 403    | `Admin account is deactivated`| The admin exists but is disabled         |
| 429    | Too many auth attempts        | 20 login attempts per 15 minutes per IP  |

### Using the admin token

Send it on every other admin request:

```
Authorization: Bearer <admin token>
```

- The admin token is valid for **1 day**. On **401**, log in again.
- Admin tokens only work on `/api/v1/admin/*`. App user tokens are rejected on admin routes, and admin tokens are rejected on app routes.

### Current admin

`GET /auth/me` returns the logged-in admin in `data`.

## Users

| Method | Path          | Description                    |
| ------ | ------------- | ------------------------------ |
| GET    | `/users`      | List users, newest first       |
| GET    | `/users/:id`  | Get one user                   |
| DELETE | `/users/:id`  | Delete a user and their addresses |

`GET /users?page=1&limit=20`. `limit` is capped at 100. Response `data`:

```json
{ "items": [ /* user objects */ ], "total": 42, "page": 1, "pages": 3 }
```

Deleting a user cannot be undone.

## Endpoints

| Method | Path          | Auth        | Description           |
| ------ | ------------- | ----------- | --------------------- |
| POST   | `/auth/login` | none        | Admin login           |
| GET    | `/auth/me`    | Admin token | Current admin         |
| GET    | `/users`      | Admin token | List users            |
| GET    | `/users/:id`  | Admin token | Get a user            |
| DELETE | `/users/:id`  | Admin token | Delete a user         |

## Changelog for admins

| Date       | Change                                                        |
| ---------- | ------------------------------------------------------------- |
| 2026-10-03 | Admin model and login added. User list, view and delete moved here from the app API. |
