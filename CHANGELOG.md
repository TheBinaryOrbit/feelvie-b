# Changelog

All notable changes to the Feelvie backend. Newest first.

## 2026-10-03 (Razorpay billing)

### Added

- Subscriptions with Razorpay autopay:
  - `POST /api/v1/subscriptions` creates a Razorpay subscription and returns Checkout options. The first cycle is charged immediately, and later cycles are auto-debited.
  - `POST /api/v1/subscriptions/verify` checks the Checkout signature, activates the subscription and grants the first month's credits.
  - `GET /api/v1/subscriptions/me` and `POST /api/v1/subscriptions/cancel`. Cancelling an active subscription takes effect at the end of the period.
  - One live subscription per user, enforced by a unique index. An abandoned unpaid checkout is replaced automatically.
- Credit pack purchases: `POST /api/v1/credit-packs/:id/purchase` and `POST /api/v1/credit-packs/verify`. These need an active subscription, otherwise 403. Credits expire `validityDays` after payment.
- Monthly credit grants, with each month's credits expiring at the end of that month. Yearly plans get one grant per month for 12 months.
- Razorpay webhook at `POST /api/v1/webhooks/razorpay`. It verifies signatures, dedupes events and handles renewals, failed payments, cancellations and pack payments.
- Hourly credits job using node-cron, for yearly monthly grants, catch-up and expiry. It can be disabled with `JOBS_ENABLED=false`.
- `UserSubscription`, `Payment` and `WebhookEvent` models.
- Admin `GET /api/v1/admin/subscriptions` (filter by status or user) and `GET /api/v1/admin/subscriptions/:id`, which includes payments.
- A Razorpay setup guide in `docs/ADMIN_GUIDE.md`.

### Changed

- An admin can no longer delete a user who has a live subscription (409).

## 2026-10-03 (wallet and credits)

### Added

- `Wallet` model, one per user, with a cached balance and lifetime totals.
- `CreditTransaction` model. Credit lots record credits added, credits remaining and the expiry date. Debits and expiries record which lots they came from.
- `wallet.service.js`:
  - Idempotent grants, keyed by `grantKey`.
  - Debits that spend the earliest-expiring lot first and can never overspend under concurrency.
  - Expiry processing.
- `GET /api/v1/wallet` and `GET /api/v1/wallet/transactions` for users.
- Admin endpoints to view a user's wallet and history, and to grant or debit credits with a reason.

## 2026-10-03 (plans and packs)

### Added

- `SubscriptionPlan` model with name, audience (B2B or B2C), billing cycle (monthly or yearly), original and offer price in INR, and credits per month. Each plan is created in Razorpay too.
- `CreditPack` model with name, credits, price in INR and validity in days.
- Admin CRUD at `/api/v1/admin/plans` and `/api/v1/admin/credit-packs`. Delete deactivates.
- Public `GET /api/v1/plans`, filterable by audience and billing cycle, and `GET /api/v1/credit-packs`.
- `razorpay.service.js`, which wraps the Razorpay SDK and checks signatures.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` env vars.

### Changed

- A plan's offer price and billing cycle cannot be changed after creation, because Razorpay plans are immutable.

## 2026-10-03 (admin)

### Added

- `Admin` model with email and bcrypt-hashed password, and `POST /api/v1/admin/auth/login`, which returns a 1-day admin token.
- `GET /api/v1/admin/auth/me`, and admin user management at `/api/v1/admin/users` (list, view, delete).
- `npm run create-admin` script. There is no public admin signup.
- `docs/ADMIN_GUIDE.md`, kept separate from the frontend guide.
- The request validator now supports `integer`, `min`, `max` and `enum` rules.

### Changed

- Tokens now carry a `type` claim. User tokens are rejected on admin routes and admin tokens on app routes.
- `/users/:id` is now limited to the user's own id.
- Deactivated users are now blocked on every request, not only at login.

### Removed

- The `role` field on User, and the `authorize` and `selfOrAdmin` middleware. `GET /users` and `DELETE /users/:id` moved to the admin API.

## 2026-10-03

### Added

- User addresses. A user can save up to 10 addresses, with exactly one default.
  - New `Address` model: label, recipient name and phone, address lines, landmark, city, state, 6-digit PIN code, country, optional map location, and the default flag.
  - Endpoints under `/api/v1/addresses`: list, add, get, update, set default and delete. They only act on the logged-in user's own addresses.
  - The first address becomes the default. Deleting the default promotes the newest remaining address.
  - Deleting a user also deletes their addresses.
- Project documentation: `docs/ARCHITECTURE.md`, `docs/FRONTEND_GUIDE.md`, `CLAUDE.md` and this changelog.
- Phone number + OTP authentication.
  - `POST /api/v1/auth/get-otp` sends an OTP, mocked to `123456` while `OTP_MOCK=true`.
  - `POST /api/v1/auth/verify-otp` returns the user and a JWT, or 404 `OTP matched, account not found`.
  - OTPs are hashed, expire after 5 minutes, are single-use and lock after 5 wrong attempts.
- `Otp` model with a TTL index.
- `lastLoginAt` field on users.
- Initial project scaffold: Express app, MongoDB connection, layered folder structure, central error handling, rate limiting, user CRUD routes.

### Changed

- JWT lifetime is now 120 days.
- The User model is keyed by `phone`. `name` and `email` are optional.
- Users can update `email` as well as `name`.

### Removed

- Email and password register and login, and the `bcryptjs` dependency.
