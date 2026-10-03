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

## User wallets and credits

Each user has a wallet. Credits are stored as lots. Every lot has `creditsAdded`, `creditsRemaining` and an expiry date `expiresOn`. Spending uses the lot that expires first.

### View a user's wallet

`GET /users/:id/wallet` returns the same shape the app sees:
- `balance`: credits the user can spend right now.
- `nextExpiry`: the next lot to expire.
- `activeLots`: lots with credits left, earliest expiry first.
- `wallet`: lifetime totals for credited, debited and expired.

`GET /users/:id/wallet/transactions?type=credit&page=1&limit=20` lists the full history. `type` is optional and can be `credit`, `debit` or `expire`.

### Adjust credits manually

Use this for support cases, goodwill credits and testing. Every adjustment records your admin id and the reason.

`POST /users/:id/credits`

| Field           | Required        | Type    | Rules                                    |
| --------------- | --------------- | ------- | ---------------------------------------- |
| `action`        | Yes             | string  | `"grant"` or `"debit"`                   |
| `credits`       | Yes             | integer | 1 to 1,000,000                           |
| `expiresInDays` | For grants only | integer | 1 to 3650. Granted credits expire this many days from now |
| `reason`        | Yes             | string  | Saved as `Admin adjustment: <reason>`    |

Grant example:

```json
{ "action": "grant", "credits": 100, "expiresInDays": 30, "reason": "Compensation for outage on 3 Oct" }
```

Debit example. Credits are taken from the lots that expire first:

```json
{ "action": "debit", "credits": 40, "reason": "Duplicate grant correction" }
```

Response `201`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Credits adjusted",
  "data": {
    "transaction": {
      "_id": "6ac0f1005079aaf00c50ea00",
      "type": "credit",
      "source": "admin",
      "creditsAdded": 100,
      "creditsRemaining": 100,
      "expiresOn": "2026-11-02T10:00:00.000Z",
      "balanceAfter": 160,
      "description": "Admin adjustment: Compensation for outage on 3 Oct",
      "admin": "6ac0d1ae5079aaf00c50e634",
      "createdAt": "2026-10-03T10:00:00.000Z"
    },
    "balance": 160
  }
}
```

| Status | `message`                                    | Meaning                                  |
| ------ | -------------------------------------------- | ---------------------------------------- |
| 400    | `Validation failed`                          | See `details`, for example a missing `expiresInDays` on a grant |
| 400    | `Insufficient credits. Available: X, required: Y` | The debit is more than the balance |
| 404    | `User not found`                             |                                          |
| 409    | `Credits changed while processing...`        | The user spent credits at the same moment. Retry |

## Subscription plans

Plans are what users subscribe to. Each plan is also created as a plan in Razorpay, which handles the recurring autopay billing. Razorpay must be configured before a plan can be created, otherwise you get **503**.

### Plan fields

| Field              | Required | Type    | Rules                                               | Editable later |
| ------------------ | -------- | ------- | --------------------------------------------------- | -------------- |
| `name`             | Yes      | string  | Max 100 chars                                       | Yes            |
| `description`      | No       | string  | Max 1000 chars                                      | Yes            |
| `audience`         | Yes      | string  | `"B2B"` or `"B2C"`                                  | Yes            |
| `billingCycle`     | Yes      | string  | `"monthly"` or `"yearly"`                           | **No**         |
| `originalPriceInr` | Yes      | number  | At least 1. Display price, shown struck through     | Yes            |
| `offerPriceInr`    | Yes      | number  | At least 1, and not more than `originalPriceInr`. This is what the customer is charged each cycle | **No** |
| `creditsPerMonth`  | Yes      | integer | At least 1. Granted every month, for yearly plans too | Yes          |
| `isActive`         | -        | boolean | Default `true`. Only active plans are shown in the app | Yes         |

The server also returns `_id`, `razorpayPlanId`, `createdBy`, `createdAt` and `updatedAt`.

**Why price and billing cycle are locked:** Razorpay plans cannot be changed after they are created. To change the price, deactivate the plan and create a new one. Existing subscribers stay on the plan and price they bought.

**Changing `creditsPerMonth`** affects new subscribers only. Existing subscribers keep the credits they signed up for.

### Create a plan

`POST /plans`

```json
{
  "name": "Pro Monthly",
  "description": "For regular users",
  "audience": "B2C",
  "billingCycle": "monthly",
  "originalPriceInr": 999,
  "offerPriceInr": 499,
  "creditsPerMonth": 100
}
```

Response `201`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Plan created",
  "data": {
    "_id": "6ac0e1a05079aaf00c50e701",
    "name": "Pro Monthly",
    "description": "For regular users",
    "audience": "B2C",
    "billingCycle": "monthly",
    "originalPriceInr": 999,
    "offerPriceInr": 499,
    "creditsPerMonth": 100,
    "razorpayPlanId": "plan_PbQ7xYz123",
    "isActive": true,
    "createdBy": "6ac0d1ae5079aaf00c50e634",
    "createdAt": "2026-10-03T10:00:00.000Z",
    "updatedAt": "2026-10-03T10:00:00.000Z"
  }
}
```

### List, view, edit and deactivate

- `GET /plans?audience=B2C&billingCycle=monthly&isActive=true&page=1&limit=20`. All filters are optional, and inactive plans are included unless filtered out. Returns `{ items, total, page, pages }`.
- `GET /plans/:id` returns one plan.
- `PATCH /plans/:id` with any editable fields. Sending `offerPriceInr` or `billingCycle` with a different value returns **400**.
- `DELETE /plans/:id` deactivates the plan. It is hidden from the app and cannot be bought, but existing subscriptions keep renewing. Set `isActive: true` with `PATCH` to bring it back.

### Plan errors

| Status | `message`                                         | Meaning                                    |
| ------ | ------------------------------------------------- | ------------------------------------------ |
| 400    | `Validation failed`                               | See `details`, for example offer price above original |
| 400    | `offerPriceInr cannot be changed after a plan is created...` | Create a new plan instead       |
| 404    | `Plan not found`                                  |                                            |
| 502    | `Payment provider error: ...`                     | Razorpay rejected the request              |
| 503    | `Payments are not configured...`                  | Razorpay keys are missing on the server    |

## Credit packs

Credit packs are one-off purchases that add credits on top of a subscription. Users can only buy a pack while they have an active subscription. Packs are not created in Razorpay. An order is created at the time of each purchase.

### Pack fields

| Field          | Required | Type    | Rules                                                  |
| -------------- | -------- | ------- | ------------------------------------------------------ |
| `name`         | Yes      | string  | Max 100 chars                                          |
| `description`  | No       | string  | Max 1000 chars                                         |
| `credits`      | Yes      | integer | At least 1                                             |
| `priceInr`     | Yes      | number  | At least 1                                             |
| `validityDays` | Yes      | integer | 1 to 3650. Credits expire this many days after purchase |
| `isActive`     | -        | boolean | Default `true`                                         |

Every field is editable. Changes apply to future purchases only. Credits already bought keep their original amount and expiry.

### Endpoints

- `POST /credit-packs` with the fields above. Returns **201** with the pack.

  ```json
  { "name": "Starter Pack", "credits": 50, "priceInr": 199, "validityDays": 90 }
  ```

- `GET /credit-packs?isActive=true&page=1&limit=20` lists packs, including inactive ones unless filtered.
- `GET /credit-packs/:id`, `PATCH /credit-packs/:id` and `DELETE /credit-packs/:id`. Delete deactivates the pack.

## Endpoints

| Method | Path                | Auth        | Description                  |
| ------ | ------------------- | ----------- | ---------------------------- |
| POST   | `/auth/login`       | none        | Admin login                  |
| GET    | `/auth/me`          | Admin token | Current admin                |
| GET    | `/users`            | Admin token | List users                   |
| GET    | `/users/:id`        | Admin token | Get a user                   |
| DELETE | `/users/:id`        | Admin token | Delete a user                |
| GET    | `/users/:id/wallet` | Admin token | A user's wallet              |
| GET    | `/users/:id/wallet/transactions` | Admin token | A user's credit history |
| POST   | `/users/:id/credits` | Admin token | Grant or debit credits      |
| GET    | `/plans`            | Admin token | List plans                   |
| POST   | `/plans`            | Admin token | Create a plan                |
| GET    | `/plans/:id`        | Admin token | Get a plan                   |
| PATCH  | `/plans/:id`        | Admin token | Edit a plan                  |
| DELETE | `/plans/:id`        | Admin token | Deactivate a plan            |
| GET    | `/credit-packs`     | Admin token | List credit packs            |
| POST   | `/credit-packs`     | Admin token | Create a credit pack         |
| GET    | `/credit-packs/:id` | Admin token | Get a credit pack            |
| PATCH  | `/credit-packs/:id` | Admin token | Edit a credit pack           |
| DELETE | `/credit-packs/:id` | Admin token | Deactivate a credit pack     |

## Changelog for admins

| Date       | Change                                                        |
| ---------- | ------------------------------------------------------------- |
| 2026-10-03 | User wallets added. View a user's wallet and history, and grant or debit credits manually. |
| 2026-10-03 | Subscription plans and credit packs added, with create, list, view, edit and deactivate. |
| 2026-10-03 | Admin model and login added. User list, view and delete moved here from the app API. |
