# Changelog

All notable changes to the Feelvie backend. Newest first.

## 2026-10-16

### Fixed

- Starting a monthly subscription failed with a 502 because Razorpay allows at most 50 billing cycles for a monthly plan. Monthly subscriptions now use `total_count` 50. Yearly stays at 10.
- Behind a proxy such as the dev tunnel, `express-rate-limit` raised `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` and could not tell clients apart. The new `TRUST_PROXY` env var sets Express `trust proxy`. It defaults to `0`.

## 2026-10-12 (banners)

### Added

- `Banner` model: an image for the mobile app, an optional `slug`, the `screenName` to open on tap, `title`, `isActive` and `sortOrder`.
- `GET /api/v1/banners`: a public list of active banners in display order.
- Admin endpoints under `/api/v1/admin/banners`: list, view, create (multipart with an image), edit and delete. Deleting a banner also deletes its image file.

## 2026-10-12 (signup)

### Added

- `POST /api/v1/auth/signup`: creates the account for a phone number that passed OTP verification, from a signup token and the user's name, and returns the user and a login token.

### Changed

- A 404 from `POST /api/v1/auth/verify-otp` now includes `details.signupToken` and `details.expiresInSeconds`. The status and message are unchanged.

## 2026-10-03 (vendor store page)

### Added

- `GET /api/v1/vendors/:vendorId/products`: a public list of one vendor's store products, with the same filters as the store listing. It returns items only while the vendor has an active B2B subscription, and reports `vendorHasActiveSubscription`.

## 2026-10-03 (orders)

### Added

- `Order` model: one product, one size and a quantity per order, for sale or rent, with a product snapshot, a copy of the shipping address, pricing, status history and a refund record.
- Buyer endpoints: `POST /api/v1/orders`, `POST /api/v1/orders/:id/verify`, `GET /api/v1/orders`, `GET /api/v1/orders/:id` and `POST /api/v1/orders/:id/cancel`.
- Seller endpoints under `/api/v1/orders/selling`: list, view, move to the next step and cancel.
- Admin endpoints under `/api/v1/admin/orders`: list with filters, view with payment, move, cancel and `refund-done`.
- Payment by Razorpay or cash on delivery. COD is for sale orders only.
- Rentals: start date and days, a refundable security deposit, and a `returned` step that restocks the piece and creates the deposit refund.
- Atomic stock reservation at order time, released on cancel, expiry or return.
- Unpaid online orders are cancelled after 30 minutes by the 10-minute job. A payment that arrives afterwards becomes a pending refund.

### Changed

- `Payment` has a new kind `order` and an `order` reference. The Razorpay webhook routes `order.paid`, `payment.captured` and `payment.failed` by payment kind.
- A user with unfinished orders, an unreturned rental or a pending refund cannot be deleted (409).

## 2026-10-03 (wishlist)

### Added

- `WishlistItem` model and `GET /api/v1/wishlist`, `POST /api/v1/wishlist` and `DELETE /api/v1/wishlist/:productId`. A wishlist holds up to 200 store-visible products.
- `optionalAuth` middleware. `GET /api/v1/products` and `GET /api/v1/products/:slug` stay public, and return `isWishlisted` when a user token is sent.
- `vendor` filter on `GET /api/v1/products`, for a vendor store page.

### Changed

- Deleting a product removes it from every wishlist. Deleting a user removes their wishlist.

## 2026-10-03 (vendor product rule)

### Changed

- The 5-product rule for vendor applications is now enforced. `POST /api/v1/vendors/apply` returns 403 when the user has fewer than 5 products that are not blocked.
- `eligibility.products` in `GET /api/v1/vendors/me` and the admin vendor detail now reports `enforced: true` and the real `count`.

## 2026-10-03 (products)

### Added

- `Product` model: a dress listed for sale or for rent, with per-size stock, 1 to 6 uploaded images, and optional brand, colour and condition.
  - Sale products have an original price and a selling price.
  - Rent products have a price per day, a security deposit, and minimum and maximum days.
- Owner endpoints: `POST /api/v1/products` (multipart with image files), `GET /api/v1/products/mine`, `GET /api/v1/products/mine/:id`, `PATCH /api/v1/products/:id` and `DELETE /api/v1/products/:id`.
- Public store endpoints: `GET /api/v1/products` with category, listing type, size, price, stock and search filters and sorting, and `GET /api/v1/products/:slug` with a category breadcrumb.
- Store visibility: a product is public only when it is active, not blocked, owned by an approved vendor, and in a visible category.
- Admin endpoints under `/api/v1/admin/products`: list, view, block with a reason and unblock.
- `productImagesUpload` middleware and a shared `uniqueSlug` helper.

### Changed

- Deleting a user also deletes their products and product images.
- Category slugs now use the shared `uniqueSlug` helper. After 20 numbered attempts it falls back to a random suffix instead of returning 409.
- The upload error for an unexpected file field now reads `Unexpected file field "...", or too many files in it`.

## 2026-10-03 (vendors simplified)

### Changed

- `POST /api/v1/vendors/apply` takes no body. The request only records that the user applied.
- Admin approval no longer re-checks the B2B subscription. It is checked only when the user applies.
- `canSell` and `sellingUserIds` depend only on the vendor being `approved`, not on the subscription staying active.

### Removed

- Vendor profile fields: `storeName`, `description`, `contactPhone`, `contactEmail`, `gstNumber` and `pickupAddress`.
- `PATCH /api/v1/vendors/me`, and the `search` filter on `GET /api/v1/admin/vendors`.

## 2026-10-03 (vendors)

### Added

- `Vendor` model: one seller profile per user with store name, description, contact phone and email, GST number, pickup address, status and the latest admin decision.
- App endpoints `GET /api/v1/vendors/me`, `POST /api/v1/vendors/apply` and `PATCH /api/v1/vendors/me`.
  - Applying needs an active B2B subscription, otherwise 403.
  - A rejected user can apply again. A suspended user cannot.
- Admin endpoints under `/api/v1/admin/vendors`: list, view, approve, reject, suspend and reinstate. Approve re-checks the B2B subscription and returns 409 if it has ended.
- `vendorService.canSell` and `sellingUserIds` for the future product module: an approved vendor with an active B2B subscription.

### Changed

- Deleting a user also deletes their vendor record.

### Not yet enforced

- The rule that a user must add 5 products before applying. It waits for the product model.

## 2026-10-03 (categories)

### Added

- `Category` model: title, slug, description, image, parentId, ancestors, level, isActive, sortOrder. Categories nest up to 3 levels.
- Admin `/api/v1/admin/categories`:
  - Create and edit, as multipart with an optional `image` file or as JSON.
  - A flat list with filters, the full tree, and a detail view with breadcrumb and children.
  - Delete deactivates the category and all its subcategories.
  - Changing `parentId` moves a whole subtree, with checks for cycles and depth.
- Public `GET /api/v1/categories` (tree of active categories) and `GET /api/v1/categories/:slug` (detail with breadcrumb and children).
- Slugs are generated automatically from titles, with numeric suffixes when taken. Renaming never changes a slug.
- `storage.service.js` saves uploaded images to disk. They are served at `/uploads` with a cross-origin resource policy.
- `PUBLIC_BASE_URL` and `UPLOADS_DIR` env vars. `uploads/` is git-ignored.

## 2026-10-03 (virtual try-on)

### Added

- `POST /api/v1/generations/try-on` (multipart: `personImage`, `garmentImage`).
  - It charges 1 credit, calls the VTON API and returns the output image.
  - Any failure or timeout refunds the credit automatically.
- `GET /api/v1/generations` and `GET /api/v1/generations/:id` return the user's generation history.
- Admin `GET /api/v1/admin/generations` (filter by status or user) and `GET /api/v1/admin/generations/:id`.
- `Generation` model.
- `vton.service.js` and the `VTON_API_URL`, `VTON_API_KEY` and `VTON_TIMEOUT_MS` env vars.
- `wallet.refundDebit`:
  - Credits go back to their original lots. If a lot has expired, a 7-day replacement is granted.
  - Each debit can only be refunded once.
- New `refund` transaction type. New `generation` and `refund` sources, and a `generation` reference on transactions.
- Limits: 30 try-on requests per 15 minutes per user, and 2 running at once.
- A job every 10 minutes refunds generations stuck in `processing`.
- The `multer` dependency, for image uploads.

### Changed

- When `debitCredits` loses a race for the last credits, it now returns 400 "Insufficient credits" instead of 409.

## 2026-10-03 (admin subscription cancel)

### Added

- `POST /api/v1/admin/subscriptions/:id/cancel` with `{ reason, immediately? }`. It cancels at the period end by default, or immediately. Unpaid or failing subscriptions are always cancelled immediately.
- `cancelledBy` (`user`, `admin` or `razorpay`), `cancelledByAdmin` and `cancelReason` on subscriptions.

### Changed

- User and admin cancellation share one code path, `cancelSubscription`.
- The cancel-twice error message now reads `This subscription is already set to cancel...`.

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
