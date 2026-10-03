# Feelvie Backend Architecture

This document describes how the Feelvie backend is organised and how a request moves through it.
Keep it in sync with the code. Any change to structure, models, auth, middleware or config must update this file in the same commit.

_Last updated: 2026-10-03_

## Tech stack

| Concern        | Choice                                           |
| -------------- | ------------------------------------------------ |
| Runtime        | Node.js 22, ES modules                           |
| HTTP framework | Express 4                                        |
| Database       | MongoDB 7 via Mongoose 8                         |
| Auth (users)   | Phone number + OTP, then JWT (120 days)          |
| Auth (admins)  | Email + bcrypt password, then JWT (1 day)        |
| Security       | helmet, cors, express-rate-limit                 |
| Logging        | morgan for requests, `utils/logger` for app logs |
| Dev tooling    | nodemon, ESLint 9 (flat config)                  |

## Layered design

Every request flows through the same layers. Each layer only talks to the one below it.

```
Client
  |
  v
app.js          helmet, cors, JSON body parser, morgan, global rate limiter
  |
  v
routes/         maps URL + method to a handler; attaches route-level middleware
  |
  v
middleware/     validate input, authenticate (protect / protectAdmin), authorise (selfOnly)
  |
  v
controllers/    read req, call a service, send ApiResponse. No business logic.
  |
  v
services/       business rules and database access. Throws ApiError on failure.
  |
  v
models/         Mongoose schemas and indexes
  |
  v
MongoDB
```

Errors thrown anywhere are caught by `asyncHandler` and forwarded to `middleware/errorHandler.js`, which converts them to the standard error response.

## Folder structure

```
src/
├── app.js                  Express app, global middleware, mounts /api/v1
├── server.js               Entry point: connect DB, start server, graceful shutdown
├── config/
│   ├── env.js              Loads .env, validates required vars, exports `env`
│   └── db.js               connectDB / disconnectDB
├── routes/
│   ├── index.js            /health, mounts /auth, /users, /addresses and /admin
│   ├── auth.routes.js      get-otp, verify-otp, me
│   ├── user.routes.js      the logged-in user's own profile
│   ├── address.routes.js   the logged-in user's addresses
│   ├── plan.routes.js      public list of active plans
│   ├── creditPack.routes.js public list of active packs
│   ├── wallet.routes.js    the logged-in user's wallet and transactions
│   └── admin/
│       ├── index.js        /admin/auth is public; everything else behind protectAdmin
│       ├── auth.routes.js  admin login, me
│       ├── user.routes.js  list, view, delete users; user wallet and credit adjustments
│       ├── plan.routes.js  plan CRUD
│       └── creditPack.routes.js pack CRUD
├── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── address.controller.js
│   └── admin/              admin controllers, same pattern
├── services/
│   ├── auth.service.js     OTP login flow, issues user JWT
│   ├── otp.service.js      Generate, store, deliver and verify OTPs
│   ├── user.service.js     User CRUD with field whitelist; deleting a user deletes their addresses
│   ├── address.service.js  Address CRUD, default-address rules, per-user limit
│   ├── admin.service.js    Admin login and creation
│   ├── razorpay.service.js The only module that calls Razorpay; signature checks
│   ├── plan.service.js     Plan CRUD, mirrors plans to Razorpay, locks price and cycle
│   ├── creditPack.service.js Pack CRUD
│   └── wallet.service.js   The only code that changes credits: grant, debit, expire, balance
├── models/
│   ├── user.model.js
│   ├── otp.model.js
│   ├── address.model.js
│   ├── admin.model.js
│   ├── subscriptionPlan.model.js
│   ├── creditPack.model.js
│   ├── wallet.model.js
│   └── creditTransaction.model.js
├── middleware/
│   ├── auth.js             protect, protectAdmin, selfOnly
│   ├── validate.js         Body/params/query validator: type, integer, min, max, enum, pattern
│   ├── rateLimiter.js      apiLimiter, authLimiter
│   └── errorHandler.js     notFound + central error handler
└── utils/
    ├── ApiError.js         Error class with HTTP status helpers
    ├── ApiResponse.js      Standard success envelope
    ├── asyncHandler.js     Forwards async errors to Express
    ├── jwt.js              signUserToken / signAdminToken / verifyToken
    ├── pagination.js       parsePagination, paginate
    ├── query.js            parseBooleanQuery
    ├── phone.js            normalizePhone, PHONE_REGEX
    └── logger.js

scripts/
└── create-admin.js         Creates an admin from the command line
```

Each `src` folder has an `index.js` barrel export.

## Data models

### User (`users` collection)

| Field                    | Type    | Notes                                               |
| ------------------------ | ------- | --------------------------------------------------- |
| `phone`                  | String  | Required, unique, normalised (e.g. `+919876543210`) |
| `name`                   | String  | Optional, max 100 chars                             |
| `email`                  | String  | Optional, unique when present (sparse index)        |
| `isActive`               | Boolean | Default `true`. Inactive users cannot log in        |
| `lastLoginAt`            | Date    | Set on each successful OTP login                    |
| `createdAt`, `updatedAt` | Date    | Mongoose timestamps                                 |

### Admin (`admins` collection)

Admins are a separate model from app users. They log in with email and password and manage the platform.

| Field                    | Type    | Notes                                                |
| ------------------------ | ------- | ---------------------------------------------------- |
| `email`                  | String  | Required, unique, stored lowercase                   |
| `password`               | String  | bcrypt hash (cost 12), min 8 chars, `select: false`, never returned |
| `name`                   | String  | Optional                                             |
| `isActive`               | Boolean | Default `true`. Inactive admins cannot log in or use tokens |
| `lastLoginAt`            | Date    | Set on each login                                    |
| `createdAt`, `updatedAt` | Date    | Mongoose timestamps                                  |

There is no signup endpoint. Admins are created with `npm run create-admin -- --email <email> --password <password> --name <name>`.

### SubscriptionPlan (`subscriptionplans` collection)

Created by admins. Each plan is mirrored as a Razorpay plan, which drives recurring autopay billing.

| Field              | Type     | Notes                                                       |
| ------------------ | -------- | ----------------------------------------------------------- |
| `name`             | String   | Required, max 100 chars                                     |
| `description`      | String   | Optional, max 1000 chars                                    |
| `audience`         | String   | `B2B` or `B2C`                                              |
| `billingCycle`     | String   | `monthly` or `yearly`. **Locked** after creation            |
| `originalPriceInr` | Number   | Display price, ≥ 1                                          |
| `offerPriceInr`    | Number   | Charged price, ≥ 1 and ≤ `originalPriceInr`. **Locked** after creation |
| `creditsPerMonth`  | Number   | Integer ≥ 1. Granted monthly for both cycles                |
| `razorpayPlanId`   | String   | Unique. Razorpay `plan_...` id                              |
| `isActive`         | Boolean  | Indexed. Inactive plans are hidden from the app and cannot be bought |
| `createdBy`        | ObjectId | Admin                                                       |

Price and cycle are locked because Razorpay plans are immutable. `plan.service.create` validates the document locally before calling Razorpay, so invalid input never leaves an orphan Razorpay plan. `DELETE` is a soft deactivate.

### CreditPack (`creditpacks` collection)

One-off credit top-ups, created by admins. Not mirrored in Razorpay. An order is created at purchase time.

| Field          | Type     | Notes                                        |
| -------------- | -------- | -------------------------------------------- |
| `name`         | String   | Required, max 100 chars                      |
| `description`  | String   | Optional                                     |
| `credits`      | Number   | Integer ≥ 1                                  |
| `priceInr`     | Number   | ≥ 1                                          |
| `validityDays` | Number   | Integer 1 to 3650. Credits expire this many days after purchase |
| `isActive`     | Boolean  | Indexed                                      |
| `createdBy`    | ObjectId | Admin                                        |

All fields are editable. Edits apply to future purchases only.

### Wallet (`wallets` collection)

One per user, created on first use. The wallet is a summary. The credit lots below are the source of truth.

| Field              | Type     | Notes                                                         |
| ------------------ | -------- | ------------------------------------------------------------- |
| `user`             | ObjectId | Unique                                                        |
| `balance`          | Number   | Cached sum of `creditsRemaining` on unexpired lots. Recomputed after every change and on every read |
| `lifetimeCredited` | Number   | Total credits ever granted                                    |
| `lifetimeDebited`  | Number   | Total credits ever spent                                      |
| `lifetimeExpired`  | Number   | Total credits that expired unused                             |

### CreditTransaction (`credittransactions` collection)

Every wallet change is one transaction. There are three types:

| Type     | Meaning                         | Key fields                                                     |
| -------- | ------------------------------- | -------------------------------------------------------------- |
| `credit` | A **lot** of credits added      | `creditsAdded`, `creditsRemaining` (decreases as credits are used), `expiresOn`, `isExpired` |
| `debit`  | Credits spent                   | `creditsDeducted`, `breakdown: [{ lot, credits }]` showing which lots paid |
| `expire` | Unused remainder of a lot that passed `expiresOn` | `creditsDeducted`, `breakdown` with the one lot |

Common fields:
- `user`, `wallet`, `type`, `balanceAfter` and `description`.
- `source`: `subscription`, `credit_pack`, `admin`, `usage` or `expiry`.
- `subscription`, `creditPack`, `payment` and `admin`: references to what caused the transaction.
- `grantKey`: unique and sparse. It makes grants idempotent. Subscription months use `sub:<subscriptionId>:<windowStartISO>`, and pack purchases use `pay:<razorpayPaymentId>`.

Indexes:
- `{ user, type, expiresOn, creditsRemaining }` finds spendable lots.
- `{ type, isExpired, expiresOn }` finds lots to expire.
- `{ user, createdAt }` serves history.

### Credit rules (`wallet.service.js`)

`wallet.service.js` is the only code that changes credits.

- **Grant:** `grantCredits` creates a lot.
  - With a `grantKey`, repeat or concurrent calls return the same lot instead of granting twice. A webhook retry and a checkout verify can both fire safely.
  - A lot whose `expiresOn` is already past is skipped.
- **Spend:** `debitCredits` takes credits from the lot that expires first, then the next.
  - Each lot is decremented with a conditional atomic update (`creditsRemaining >= take`), so concurrent debits can never overspend.
  - If the balance is too low it returns 400 before touching anything. If a race leaves it short, it refunds what it took and returns 409.
- **Expire:** `expireLots` marks every lot past `expiresOn` as expired, zeroes it, and writes an `expire` transaction for the unused part. It is safe to run repeatedly or from several processes.
- **Balance:** reads compute the live balance from unexpired lots. Lots that have passed their expiry are never counted, even before the expiry job has run.

### Otp (`otps` collection)

| Field       | Type   | Notes                                                |
| ----------- | ------ | ---------------------------------------------------- |
| `phone`     | String | Unique. One active OTP per phone number              |
| `codeHash`  | String | SHA-256 of the code. The plain code is never stored  |
| `attempts`  | Number | Wrong guesses so far                                 |
| `expiresAt` | Date   | TTL index. MongoDB deletes the document after expiry |

### Address (`addresses` collection)

A user has many addresses. Each address is its own document that points to its owner.

| Field          | Type     | Required | Notes                                                |
| -------------- | -------- | -------- | ---------------------------------------------------- |
| `user`         | ObjectId | Yes      | Owner, indexed. Set from the token, never from the body |
| `label`        | String   | Yes      | `home`, `work` or `other`                            |
| `fullName`     | String   | Yes      | Recipient name, max 100 chars                        |
| `phone`        | String   | Yes      | Recipient phone, normalised like login phones        |
| `addressLine1` | String   | Yes      | Flat or house number and building, max 200 chars     |
| `addressLine2` | String   | No       | Street or area, max 200 chars                        |
| `landmark`     | String   | No       | Max 100 chars                                        |
| `city`         | String   | Yes      |                                                      |
| `state`        | String   | Yes      |                                                      |
| `pincode`      | String   | Yes      | 6-digit Indian PIN code, cannot start with 0         |
| `country`      | String   | No       | Defaults to `India`                                  |
| `location`     | Object   | No       | `{ lat, lng }`, both required when present           |
| `isDefault`    | Boolean  | No       | Default `false`                                      |
| `createdAt`, `updatedAt` | Date | -  | Mongoose timestamps                                  |

Indexes: `user`, plus a partial unique index on `{ user, isDefault }` where `isDefault` is true. The database itself rejects a second default address for the same user.

Address rules, enforced in `address.service.js`:

- A user can have at most 10 addresses (`MAX_ADDRESSES_PER_USER`).
- The first address a user adds becomes the default.
- Creating or updating with `isDefault: true`, or calling the set-default endpoint, moves the default to that address. The payload is validated before the old default is cleared, so a bad request never leaves the user without one.
- `isDefault: false` is ignored. The default only changes by choosing another address.
- Deleting the default promotes the most recently created remaining address.
- Every query filters by both address id and owner. Another user's address returns 404, never 403, so ids are not leaked.
- Deleting a user deletes all their addresses.

## Authentication flow

```
Client                              Server
  |  POST /auth/get-otp {phone}       |
  |---------------------------------->|  normalise phone, generate code
  |                                   |  upsert Otp {codeHash, expiresAt, attempts: 0}
  |                                   |  deliverCode()  (only logs while mocked)
  |<---- 200 {phone, expiresInSeconds}|
  |                                   |
  |  POST /auth/verify-otp            |
  |  {phone, otp}  ------------------>|  find Otp by phone
  |                                   |    missing or expired   -> 400
  |                                   |    attempts >= max      -> 429, OTP deleted
  |                                   |    wrong code           -> 400, attempts + 1
  |                                   |    correct              -> OTP deleted
  |                                   |  find User by phone
  |                                   |    not found            -> 404 "OTP matched, account not found"
  |                                   |    inactive             -> 403
  |<---- 200 {user, token} -----------|  set lastLoginAt, sign JWT (120 days)
```

Key rules:

- OTPs are single-use. They are deleted on success, including the 404 case.
- Requesting a new OTP replaces the previous one and resets attempts.
- Codes are compared with `crypto.timingSafeEqual` on their hashes.
- The user JWT payload is `{ id, type: 'user' }`. `protect` re-loads the user on every request, so deleted or deactivated users lose access immediately.
- **Mock mode:** while `OTP_MOCK=true` the code is always `123456`. Real SMS delivery goes in `deliverCode` in `services/otp.service.js`.

## Authorisation

Users and admins get different tokens, signed with the same secret but tagged with a `type` claim:

| Token | Payload                     | Lifetime                         | Issued by                |
| ----- | --------------------------- | -------------------------------- | ------------------------ |
| User  | `{ id, type: 'user' }`      | `JWT_EXPIRES_IN` (120 days)      | `POST /auth/verify-otp`  |
| Admin | `{ id, type: 'admin' }`     | `ADMIN_JWT_EXPIRES_IN` (1 day)   | `POST /admin/auth/login` |

| Middleware     | Rule                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `protect`      | User token required. Admin tokens are rejected with 401. Tokens with no `type`, issued before this change, are treated as user tokens. Sets `req.user` |
| `protectAdmin` | Admin token required. User tokens are rejected with 401. Sets `req.admin` |
| `selfOnly`     | `req.user` must be the user whose id is in `:id`, otherwise 403      |

Everything under `/api/v1/admin` except `/admin/auth/login` is behind `protectAdmin`. Address routes use `protect` only, and ownership is enforced inside the service by filtering on `req.user._id`.

## Error handling

Services throw `ApiError`, for example `ApiError.notFound('...')`. The central handler also maps library errors:

| Source error                | Response           |
| --------------------------- | ------------------ |
| Mongoose `CastError`        | 400                |
| Mongoose `ValidationError`  | 400 with `details` |
| Mongo duplicate key `11000` | 409                |
| JWT invalid or expired      | 401                |
| Malformed JSON body         | 400                |
| Anything else               | 500, message hidden |

Stack traces are included only when `NODE_ENV` is not `production`.

## Rate limiting

| Limiter       | Applies to           | Limit                        |
| ------------- | -------------------- | ---------------------------- |
| `apiLimiter`  | All `/api/v1` routes | 100 requests / 15 min per IP |
| `authLimiter` | get-otp, verify-otp, admin login | 20 requests / 15 min per IP  |

## Configuration

| Variable             | Default       | Purpose                          |
| -------------------- | ------------- | -------------------------------- |
| `NODE_ENV`           | `development` | `production` hides stack traces  |
| `PORT`               | `5000`        | HTTP port                        |
| `MONGO_URI`          | required      | MongoDB connection string        |
| `JWT_SECRET`         | required      | JWT signing secret               |
| `JWT_EXPIRES_IN`     | `120d`        | User token lifetime              |
| `ADMIN_JWT_EXPIRES_IN` | `1d`        | Admin token lifetime             |
| `OTP_EXPIRY_MINUTES` | `5`           | OTP lifetime                     |
| `OTP_MAX_ATTEMPTS`   | `5`           | Wrong guesses before lockout     |
| `OTP_MOCK`           | `true`        | Fixed code `123456`, no SMS sent |
| `RAZORPAY_KEY_ID`    | empty         | Razorpay API key id. Also sent to the app for Checkout |
| `RAZORPAY_KEY_SECRET`| empty         | Razorpay API secret. Used for API calls and Checkout signatures |
| `RAZORPAY_WEBHOOK_SECRET` | empty    | Secret set on the Razorpay webhook. Used to verify webhook signatures |
| `CORS_ORIGIN`        | `*`           | Allowed frontend origin          |

When the Razorpay keys are empty, the server still starts, but any payment action returns 503. Razorpay errors are returned as 502 with Razorpay's description.

## Adding a feature

1. Model in `src/models/<name>.model.js`, exported from `models/index.js`.
2. Service in `src/services/<name>.service.js`. Throw `ApiError` for expected failures.
3. Controller in `src/controllers/<name>.controller.js`, wrapped in `asyncHandler`, responding with `ApiResponse`.
4. Router in `src/routes/<name>.routes.js`, mounted in `routes/index.js`.
5. Admin-only endpoints go in `src/routes/admin/` and are mounted in `routes/admin/index.js`, after `protectAdmin`.
6. Update this file, `docs/FRONTEND_GUIDE.md` for app endpoints, `docs/ADMIN_GUIDE.md` for admin endpoints, and add an entry to `CHANGELOG.md`.

## Known gaps

- No signup endpoint yet. Unknown phone numbers get 404 after OTP verification.
- OTP delivery is mocked.
- No automated test suite yet.
- Address default switching uses two writes without a transaction. The unique index prevents two defaults, but a crash between the writes could leave a user with no default.
- Addresses are India-only. International support would need a different postal code rule.
