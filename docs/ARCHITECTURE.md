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
| Auth           | Phone number + OTP, then JWT (120 days)          |
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
middleware/     validate input, authenticate (protect), authorise (authorize, selfOrAdmin)
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
│   ├── index.js            /health, mounts /auth and /users
│   ├── auth.routes.js      get-otp, verify-otp, me
│   └── user.routes.js      user CRUD
├── controllers/
│   ├── auth.controller.js
│   └── user.controller.js
├── services/
│   ├── auth.service.js     OTP login flow, issues JWT
│   ├── otp.service.js      Generate, store, deliver and verify OTPs
│   └── user.service.js     User CRUD with field whitelist
├── models/
│   ├── user.model.js
│   └── otp.model.js
├── middleware/
│   ├── auth.js             protect, authorize(...roles), selfOrAdmin
│   ├── validate.js         Lightweight body/params/query validator
│   ├── rateLimiter.js      apiLimiter, authLimiter
│   └── errorHandler.js     notFound + central error handler
└── utils/
    ├── ApiError.js         Error class with HTTP status helpers
    ├── ApiResponse.js      Standard success envelope
    ├── asyncHandler.js     Forwards async errors to Express
    ├── jwt.js              signToken / verifyToken
    ├── phone.js            normalizePhone, PHONE_REGEX
    └── logger.js
```

Each folder has an `index.js` barrel export.

## Data models

### User (`users` collection)

| Field                    | Type    | Notes                                               |
| ------------------------ | ------- | --------------------------------------------------- |
| `phone`                  | String  | Required, unique, normalised (e.g. `+919876543210`) |
| `name`                   | String  | Optional, max 100 chars                             |
| `email`                  | String  | Optional, unique when present (sparse index)        |
| `role`                   | String  | `user` (default) or `admin`                         |
| `isActive`               | Boolean | Default `true`. Inactive users cannot log in        |
| `lastLoginAt`            | Date    | Set on each successful OTP login                    |
| `createdAt`, `updatedAt` | Date    | Mongoose timestamps                                 |

### Otp (`otps` collection)

| Field       | Type   | Notes                                                |
| ----------- | ------ | ---------------------------------------------------- |
| `phone`     | String | Unique. One active OTP per phone number              |
| `codeHash`  | String | SHA-256 of the code. The plain code is never stored  |
| `attempts`  | Number | Wrong guesses so far                                 |
| `expiresAt` | Date   | TTL index. MongoDB deletes the document after expiry |

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
- The JWT payload is `{ id, role }`. `protect` re-loads the user on every request, so deleted users lose access immediately.
- **Mock mode:** while `OTP_MOCK=true` the code is always `123456`. Real SMS delivery goes in `deliverCode` in `services/otp.service.js`.

## Authorisation

| Middleware           | Rule                                       |
| -------------------- | ------------------------------------------ |
| `protect`            | Requires `Authorization: Bearer <token>`   |
| `authorize('admin')` | Requires `req.user.role` to be in the list |
| `selfOrAdmin`        | Admin, or the user whose id is in `:id`    |

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
| `authLimiter` | get-otp, verify-otp  | 20 requests / 15 min per IP  |

## Configuration

| Variable             | Default       | Purpose                          |
| -------------------- | ------------- | -------------------------------- |
| `NODE_ENV`           | `development` | `production` hides stack traces  |
| `PORT`               | `5000`        | HTTP port                        |
| `MONGO_URI`          | required      | MongoDB connection string        |
| `JWT_SECRET`         | required      | JWT signing secret               |
| `JWT_EXPIRES_IN`     | `120d`        | Token lifetime                   |
| `OTP_EXPIRY_MINUTES` | `5`           | OTP lifetime                     |
| `OTP_MAX_ATTEMPTS`   | `5`           | Wrong guesses before lockout     |
| `OTP_MOCK`           | `true`        | Fixed code `123456`, no SMS sent |
| `CORS_ORIGIN`        | `*`           | Allowed frontend origin          |

## Adding a feature

1. Model in `src/models/<name>.model.js`, exported from `models/index.js`.
2. Service in `src/services/<name>.service.js`. Throw `ApiError` for expected failures.
3. Controller in `src/controllers/<name>.controller.js`, wrapped in `asyncHandler`, responding with `ApiResponse`.
4. Router in `src/routes/<name>.routes.js`, mounted in `routes/index.js`.
5. Update this file and `docs/FRONTEND_GUIDE.md`, and add an entry to `CHANGELOG.md`.

## Known gaps

- No signup endpoint yet. Unknown phone numbers get 404 after OTP verification.
- OTP delivery is mocked.
- No automated test suite yet.
