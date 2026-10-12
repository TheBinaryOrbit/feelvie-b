# Feelvie Backend Architecture

This document describes how the Feelvie backend is organised and how a request moves through it.
Keep it in sync with the code. Any change to structure, models, auth, middleware or config must update this file in the same commit.

_Last updated: 2026-10-12_

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
app.js          helmet, cors, morgan; raw-body webhook route; JSON body parser; global rate limiter
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
├── app.js                  Express app, global middleware, webhook route, mounts /api/v1
├── server.js               Entry point: connect DB, start server and credits job, graceful shutdown
├── jobs/
│   └── credits.job.js      Hourly credit grants and expiry; 10-minute stuck-generation recovery
├── config/
│   ├── env.js              Loads .env, validates required vars, exports `env`
│   └── db.js               connectDB / disconnectDB
├── routes/
│   ├── index.js            /health, mounts /auth, /users, /addresses and /admin
│   ├── auth.routes.js      get-otp, verify-otp, me
│   ├── user.routes.js      the logged-in user's own profile
│   ├── address.routes.js   the logged-in user's addresses
│   ├── plan.routes.js      public list of active plans
│   ├── creditPack.routes.js public list of active packs; purchase and verify
│   ├── wallet.routes.js    the logged-in user's wallet and transactions
│   ├── subscription.routes.js subscribe, verify, me, cancel
│   ├── generation.routes.js try-on (multipart), history
│   ├── category.routes.js  public category tree and detail by slug
│   ├── vendor.routes.js    my vendor status, apply; public /vendors/:vendorId/products
│   ├── product.routes.js   store listing and detail (public); my products CRUD (multipart)
│   ├── wishlist.routes.js  my wishlist: list, add, remove
│   ├── order.routes.js     buyer: place, verify, list, cancel; seller: /orders/selling
│   ├── banner.routes.js    public list of active banners
│   ├── webhook.routes.js   Razorpay webhook (raw body), mounted directly in app.js
│   └── admin/
│       ├── index.js        /admin/auth is public; everything else behind protectAdmin
│       ├── auth.routes.js  admin login, me
│       ├── user.routes.js  list, view, delete users; user wallet and credit adjustments
│       ├── plan.routes.js  plan CRUD
│       ├── creditPack.routes.js pack CRUD
│       ├── subscription.routes.js list, view and cancel user subscriptions
│       ├── generation.routes.js list and view generations
│       ├── category.routes.js category CRUD, tree, image upload
│       ├── vendor.routes.js list, view, approve, reject, suspend, reinstate
│       ├── product.routes.js list, view, block, unblock
│       ├── order.routes.js list, view, move, cancel, refund-done
│       └── banner.routes.js banner CRUD, image upload
├── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│   ├── address.controller.js
│   └── admin/              admin controllers, same pattern
├── services/
│   ├── auth.service.js     OTP login flow, issues user JWT
│   ├── otp.service.js      Generate, store, deliver and verify OTPs
│   ├── user.service.js     User CRUD with field whitelist; deleting a user deletes their addresses, vendor record, products, product images and wishlist; blocked while orders are unfinished
│   ├── address.service.js  Address CRUD, default-address rules, per-user limit
│   ├── admin.service.js    Admin login and creation
│   ├── razorpay.service.js The only module that calls Razorpay; signature checks
│   ├── plan.service.js     Plan CRUD, mirrors plans to Razorpay, locks price and cycle
│   ├── creditPack.service.js Pack CRUD
│   ├── wallet.service.js   The only code that changes credits: grant, debit, expire, balance
│   ├── subscription.service.js Subscribe, verify, applyRemote, syncGrants, cancel
│   ├── purchase.service.js Pack orders, verify, fulfilment (needs an active subscription)
│   ├── webhook.service.js  Webhook signature, dedupe and dispatch
│   ├── vton.service.js     The only module that calls the VTON try-on API
│   ├── generation.service.js Try-on flow: charge, call VTON, refund on failure, history, stale recovery
│   ├── storage.service.js  The only module that writes or deletes uploaded files
│   ├── category.service.js Category tree: slugs, depth, moves, cascading deactivation
│   ├── vendor.service.js   Vendor eligibility, application, admin review, canSell
│   ├── product.service.js  Product CRUD with image files, store visibility and filters, admin block
│   ├── wishlist.service.js Wishlist add, remove and list of still-visible products
│   ├── order.service.js    Orders: pricing, stock reservation, payment, steps, cancel, expiry, refunds
│   └── banner.service.js   Banner CRUD with an image file, public list of active banners
├── models/
│   ├── user.model.js
│   ├── otp.model.js
│   ├── address.model.js
│   ├── admin.model.js
│   ├── subscriptionPlan.model.js
│   ├── creditPack.model.js
│   ├── wallet.model.js
│   ├── creditTransaction.model.js
│   ├── userSubscription.model.js
│   ├── payment.model.js
│   ├── webhookEvent.model.js
│   ├── generation.model.js
│   ├── category.model.js
│   ├── vendor.model.js
│   ├── product.model.js
│   ├── wishlistItem.model.js
│   ├── order.model.js
│   └── banner.model.js
├── middleware/
│   ├── auth.js             protect, optionalAuth, protectAdmin, selfOnly
│   ├── validate.js         Body/params/query validator: type, integer, min, max, enum, pattern
│   ├── rateLimiter.js      apiLimiter, authLimiter, generationLimiter (per user)
│   ├── upload.js           multer in-memory image upload (tryOnUpload, categoryImageUpload, bannerImageUpload, productImagesUpload)
│   └── errorHandler.js     notFound + central error handler
└── utils/
    ├── ApiError.js         Error class with HTTP status helpers
    ├── ApiResponse.js      Standard success envelope
    ├── asyncHandler.js     Forwards async errors to Express
    ├── jwt.js              signUserToken / signAdminToken / verifyToken
    ├── pagination.js       parsePagination, paginate
    ├── query.js            parseBooleanQuery
    ├── date.js             addMonthsUTC (day-clamped), addDays, fromUnix, formatDay
    ├── slug.js             slugify, uniqueSlug, SLUG_PATTERN
    ├── phone.js            normalizePhone, PHONE_REGEX
    └── logger.js

scripts/
└── create-admin.js         Creates an admin from the command line

uploads/                    Uploaded files (git-ignored), served at /uploads
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
| `refund` | A debit given back, for example a failed generation | `creditsRefunded`, `breakdown` copied from the debit, `refundOf` (unique, sparse) pointing at the debit |

Common fields:
- `user`, `wallet`, `type`, `balanceAfter` and `description`.
- `source`: `subscription`, `credit_pack`, `admin`, `usage`, `generation`, `expiry` or `refund`.
- `subscription`, `creditPack`, `payment`, `admin` and `generation`: references to what caused the transaction.
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
  - If the balance is too low it returns 400 before touching anything. If a race leaves it short, it puts back what it took, then returns 400 if the balance is now too low, or 409 if the user should simply retry.
- **Refund:** `refundDebit(debitId)` reverses a debit.
  - It first inserts the `refund` transaction. Its unique `refundOf` claims the refund, so concurrent or repeated calls restore credits only once.
  - It then puts the credits back into the lots they came from.
  - If a lot has expired in the meantime, it grants a replacement lot of the same size, valid for 7 days, with `grantKey: refund:<debitId>`.
  - `lifetimeDebited` is reduced only by the credits restored to their original lots, so `lifetimeCredited - lifetimeDebited - lifetimeExpired = balance` still holds.
- **Expire:** `expireLots` marks every lot past `expiresOn` as expired, zeroes it, and writes an `expire` transaction for the unused part. It is safe to run repeatedly or from several processes.
- **Balance:** reads compute the live balance from unexpired lots. Lots that have passed their expiry are never counted, even before the expiry job has run.

### UserSubscription (`usersubscriptions` collection)

One document per subscription attempt. It mirrors a Razorpay subscription.

| Field                     | Type     | Notes                                                         |
| ------------------------- | -------- | ------------------------------------------------------------- |
| `user`, `plan`            | ObjectId | Owner and plan                                                |
| `planSnapshot`            | Object   | name, audience, billingCycle, prices and creditsPerMonth at purchase time. Grants use this, never the live plan |
| `razorpaySubscriptionId`  | String   | Unique                                                        |
| `status`                  | String   | Razorpay status: `created`, `authenticated`, `active`, `pending`, `halted`, `paused`, `cancelled`, `completed` or `expired` |
| `isLive`                  | Boolean  | Derived from `status` in a pre-validate hook. True for every status except cancelled, completed and expired |
| `currentPeriodStart`, `currentPeriodEnd` | Date | The paid billing period, from Razorpay `current_start` and `current_end` |
| `paidCount`, `totalCount` | Number   | Cycles charged so far, and the total: 120 monthly or 10 yearly |
| `startedAt`, `cancelledAt`, `endedAt` | Date |                                                     |
| `cancelAtPeriodEnd`       | Boolean  | User cancelled. Access continues until `currentPeriodEnd`     |
| `lastPaymentId`, `shortUrl` | String |                                                               |
| `cancelledBy`             | String   | `user`, `admin` or `razorpay` (cancelled from the dashboard, seen through the webhook) |
| `cancelledByAdmin`, `cancelReason` | ObjectId, String | Set on admin cancellations                    |

**One live subscription per user** is enforced by a partial unique index on `{ user }` where `isLive: true`. A boolean flag is used instead of `$in` on status, because partial indexes do not support `$in`.

### Payment (`payments` collection)

One record per Razorpay charge: every subscription cycle and every pack purchase.

| Field                    | Notes                                                        |
| ------------------------ | ------------------------------------------------------------ |
| `user`, `kind`           | `kind` is `subscription` or `credit_pack`                     |
| `status`                 | `created`, `paid` or `failed`. A `paid` payment is never downgraded |
| `amountInr`              |                                                              |
| `razorpayPaymentId`      | Unique, sparse                                               |
| `razorpayOrderId`        | Unique, sparse. Packs only                                   |
| `razorpaySubscriptionId`, `userSubscription` | Subscriptions only                       |
| `creditPack`, `packSnapshot` | Packs only. The snapshot of credits, price and validity is frozen at order time |
| `paidAt`, `failureReason` |                                                             |

### WebhookEvent (`webhookevents` collection)

`eventId` (unique), `event`, `status` (`processing`, `processed`, `ignored` or `failed`), `error` and `attempts`. Lets retried deliveries of an already-processed event return 200 without running again.

### Generation (`generations` collection)

One document per image generation request. This is the user's generation history.

| Field                 | Notes                                                        |
| --------------------- | ------------------------------------------------------------ |
| `user`                | Indexed with `createdAt` for history                         |
| `type`                | `tryon`. Room for other generation types later               |
| `status`              | `processing`, `completed` or `failed`. Indexed with `createdAt` for stale recovery |
| `personImageUrl`, `garmentImageUrl`, `outputImageUrl` | Hosted by the VTON service. We do not store image files |
| `providerJobId`       | The VTON `_id`                                               |
| `creditsCharged`, `creditsRefunded` | 1/0 on success, 1/1 on failure                |
| `debitTransaction`, `refundTransaction` | Links to the wallet                        |
| `error`, `completedAt`, `durationMs` |                                               |

### Category (`categories` collection)

A tree up to 3 levels deep (`MAX_CATEGORY_DEPTH`). Each category stores its parent, plus a materialised `ancestors` path so a whole subtree can be read or updated with one query.

| Field         | Type       | Notes                                                        |
| ------------- | ---------- | ------------------------------------------------------------ |
| `title`       | String     | Required, max 100                                            |
| `slug`        | String     | Unique, `^[a-z0-9]+(-[a-z0-9]+)*$`, max 80. Generated from the title with `utils/slug.slugify`, with `-2`, `-3` and so on added when taken. Never changed by a title edit |
| `description` | String     | Optional, max 1000                                           |
| `image`       | String     | Public path such as `/uploads/categories/<file>`. `toJSON` adds `imageUrl` = `PUBLIC_BASE_URL` + path |
| `parentId`    | ObjectId   | `null` for top level. Indexed                                |
| `ancestors`   | ObjectId[] | Root first, excluding itself. Indexed. `level = ancestors.length + 1` |
| `level`       | Number     | 1 to 3                                                       |
| `isActive`    | Boolean    | Indexed                                                      |
| `sortOrder`   | Number     | Integer. Siblings are sorted by `sortOrder`, then `title`    |
| `createdBy`, `updatedBy` | ObjectId | Admin                                            |

Rules, enforced in `category.service.js`:
- **Depth:** a new child needs a parent with `level < 3`.
- **Move:** changing `parentId` moves the whole subtree.
  - It is rejected if the new parent is the category itself or one of its descendants.
  - It is rejected if `newLevel + subtreeHeight > 3`. `subtreeHeight` is the deepest descendant's level minus the category's level.
  - After the category is saved, the descendants' `ancestors` and `level` are rewritten with one `bulkWrite`.
- **Delete:** deactivates instead of removing. One `updateMany` on `{ $or: [{ _id }, { ancestors: _id }] }` sets `isActive: false` on the category and its whole subtree.
- **Reactivate:** reactivation is per category and never cascades.
- **Public visibility:** a category is visible only when it and every ancestor are active. The tree builder only attaches nodes whose parent was included. The slug lookup checks every ancestor.
- **Image order:**
  - On create and update, the document is validated **before** the image is written, and a written image is deleted if the save fails.
  - A replaced or removed image is deleted after the save succeeds.
  - Deactivation keeps images.

### Banner (`banners` collection)

An image shown in the mobile app. Tapping it opens `screenName`, and `slug` is passed to that screen when set.

| Field        | Type     | Notes                                                             |
| ------------ | -------- | ----------------------------------------------------------------- |
| `title`      | String   | Optional label, max 100                                           |
| `image`      | String   | Required. Public path such as `/uploads/banners/<file>`. `toJSON` adds `imageUrl` |
| `slug`       | String   | Optional, `^[a-z0-9]+(-[a-z0-9]+)*$`, max 80. **Not unique**: it names the target, for example a category or product slug, not the banner |
| `screenName` | String   | Required, max 100. The app screen to open. Stored as typed        |
| `isActive`   | Boolean  | Default `true`                                                    |
| `sortOrder`  | Number   | Integer. Banners are sorted by `sortOrder`, then newest first     |
| `createdBy`, `updatedBy` | ObjectId | Admin                                                 |

Index: `{ isActive, sortOrder, createdAt }`.

Rules, enforced in `banner.service.js`:
- **Image order:** the same as categories. Input is validated before the image is written, a written image is deleted if the save fails, and a replaced image is deleted after the save succeeds.
- **Delete:** removes the document and its image file. Nothing references a banner.
- **Public list:** `GET /banners` returns active banners only.

### Product (`products` collection)

A dress listed by a user, either for sale or for rent. Any user can add products. They are public only when the owner is an approved vendor.

| Field           | Type     | Notes                                                              |
| --------------- | -------- | ------------------------------------------------------------------ |
| `owner`         | ObjectId | User. Indexed. Set from the token, never from the body             |
| `title`         | String   | Required, 3 to 150 chars                                           |
| `slug`          | String   | Unique. Built by `uniqueSlug` at creation and never changed        |
| `description`   | String   | Optional, max 2000 chars                                           |
| `category`      | ObjectId | Category. Must be active when set                                  |
| `listingType`   | String   | `sale` or `rent`. Fixed at creation                                |
| `sale`          | Object   | `{ originalPriceInr, priceInr }`. Only when `listingType` is `sale` |
| `rent`          | Object   | `{ pricePerDayInr, securityDepositInr, minDays, maxDays }`. Only when `listingType` is `rent` |
| `listPriceInr`  | Number   | `sale.priceInr` or `rent.pricePerDayInr`, kept in sync. Used for price filters and sorting |
| `sizes`         | Array    | `[{ size, stock }]`. 1 to 20 entries. `size` is uppercased and unique within the product |
| `totalStock`    | Number   | Sum of `sizes[].stock`, kept in sync                               |
| `images`        | [String] | Public paths of the files the owner uploaded, 1 to 6. `toJSON` adds `imageUrls` and `inStock` |
| `brand`, `color`, `condition` | String | Optional. `condition` is `new`, `like_new`, `good` or `fair` |
| `isActive`      | Boolean  | The owner's show or hide switch                                    |
| `isBlocked`, `blockedReason`, `blockedBy`, `blockedAt` | - | Admin moderation                |

Indexes: `owner`, `category`, unique `slug`, `{ owner, createdAt }`, `{ category, listingType, isActive, isBlocked }` and `listPriceInr`.

A `pre('validate')` hook enforces the cross-field rules: it clears the pricing block of the other listing type, checks `priceInr <= originalPriceInr` and `minDays <= maxDays`, rejects repeated sizes, and recomputes `listPriceInr` and `totalStock`.

Rules, enforced in `product.service.js`:

- **Store visibility (`publicFilter`):** the single definition of "shown in stores". A product is public only when all of these hold:
  - `isActive` is true and `isBlocked` is false.
  - Its owner is in `vendorService.sellingUserIds()`, meaning an approved vendor.
  - Its category is active and so is every ancestor (`visibleCategoryIds`).
  - Both `GET /products` and `GET /products/:slug` use it, so a hidden product returns 404 by slug.
- **Category filter:** `?category=<slug>` matches that category and everything below it, using `Category.ancestors`.
- **Vendor store page (`listForVendorStore`):** `GET /vendors/:vendorId/products` first checks `vendorService.findActiveB2BSubscription(vendorId)`. Without one it returns an empty page with `vendorHasActiveSubscription: false`. With one it calls `listPublic` with the `vendor` filter, so the normal visibility rule still applies. This is the only place where a vendor's subscription affects visibility after approval. `GET /products` and `GET /products/:slug` do not check it.
- **Input:** requests are multipart, so `normalizeInput` parses `sale`, `rent`, `sizes` and `removeImages` from JSON text and converts numbers. Only known fields are read. `owner`, `slug`, `isBlocked` and the like in the body are ignored.
- **Images:** files are uploaded by the user and never passed as URLs.
  - The document is validated before any file is written, and written files are deleted if the save fails.
  - On update, new files are appended and `removeImages` (paths or full URLs) are deleted after the save succeeds. The final count must be 1 to 6.
- **Updates:** `listingType` cannot change. Prices are merged, so one price can change alone. `sizes` is replaced as a whole.
- **Ownership:** owner queries filter on `{ _id, owner }`. Another user's product returns 404.
- **Search:** a case-insensitive regex on `title` and `brand`, with the input escaped. There is no text index.
- **Limit:** 200 products per user (`MAX_PRODUCTS_PER_USER`).
- **Deletion:** the owner's delete removes the document and its files. Deleting a user removes all their products and files.
- **Public view (`toPublic`):** strips `images`, `isActive`, `isBlocked` and the block details.

### Order (`orders` collection)

One order is one product, in one size, bought or rented from one seller. There is no cart.

| Field              | Type     | Notes                                                           |
| ------------------ | -------- | --------------------------------------------------------------- |
| `orderNumber`      | String   | Unique, readable, such as `FV-20261003-7K2M9Q`                  |
| `buyer`, `seller`  | ObjectId | Users. `seller` is the product owner when the order was placed. Both indexed |
| `product`          | ObjectId | The product ordered                                             |
| `productSnapshot`  | Object   | `{ title, slug, image, brand, color }`, copied so later edits or deletion do not change the order |
| `type`             | String   | `sale` or `rent`, from the product's `listingType`              |
| `size`, `quantity` | -        | One size. Quantity 1 to 10 (`MAX_ORDER_QUANTITY`)               |
| `pricing`          | Object   | Sale: `unitPriceInr`, `itemsTotalInr`. Rent: `pricePerDayInr`, `days`, `rentTotalInr`, `securityDepositInr`. Both: `totalInr` |
| `rental`           | Object   | Rent only: `startDate`, `endDate`, `days`, `returnedAt`         |
| `shippingAddress`  | Object   | A copy of the buyer's saved address                             |
| `paymentMethod`    | String   | `online` or `cod`                                               |
| `paymentStatus`    | String   | `pending`, `paid` or `failed`                                   |
| `razorpayOrderId`, `razorpayPaymentId`, `paidAt` | - | Online payment details. `razorpayOrderId` is unique (sparse) |
| `expiresAt`        | Date     | Payment deadline for online orders (`PAYMENT_WINDOW_MINUTES` = 30) |
| `status`           | String   | `pending_payment`, `placed`, `confirmed`, `shipped`, `delivered`, `returned` or `cancelled`. Indexed |
| `statusHistory`    | Array    | `{ status, by, at, note }`. `by` is `buyer`, `seller`, `admin` or `system` |
| `cancelledBy`, `cancelReason`, `cancelledAt` | - | Cancellation details                        |
| `refund`           | Object   | `{ amountInr, status: none / pending / done, reason, note, doneBy, doneAt }` |

Indexes: unique `orderNumber`, `buyer`, `seller`, `status`, `{ buyer, createdAt }`, `{ seller, createdAt }` and `{ status, expiresAt }` for the expiry job.

Rules, enforced in `order.service.js`:

- **Prices come from the product**, never from the request. `buildPricing` also checks the rental days against `minDays` and `maxDays` and the start date against today and `MAX_RENT_START_DAYS_AHEAD` (90).
- **Stock is reserved at creation** with `productService.reserveStock`. It is one `findOneAndUpdate` whose filter requires `stock >= quantity` for that size, so two orders cannot both take the last piece. The loser gets 409.
- **Create is compensated, not transactional.** After the stock is reserved, any failure (Razorpay, a save error) calls `releaseStock` before rethrowing.
- **Status changes are conditional updates.** `transition(order, from, set, entry)` only matches while the order is still in `from`, and pushes the history entry in the same write. A lost race returns 409.
- **Steps:** `advance` allows only the next step: `placed` to `confirmed` to `shipped` to `delivered`, then `returned` for rentals.
  - `delivered` marks a COD order paid.
  - `returned` releases the stock and sets a pending refund for the deposit.
- **Cancel:** the buyer while `pending_payment`, `placed` or `confirmed`. The seller or an admin also while `shipped`. It releases the stock, and a paid order gets a pending refund of the full total.
- **Stock is released exactly once per order,** on cancel, expiry or return, each behind a successful `transition`.
- **Payment (`markPaid`):** shared by the verify endpoint and the webhook, and safe to repeat.
  - It moves `pending_payment` to `placed`.
  - If the order is already cancelled and unpaid, it records the payment and a pending refund, with a filter that lets this happen only once.
- **Expiry (`expireUnpaid`):** cancels `pending_payment` orders past `expiresAt` as `system` and releases their stock.
- **Refunds are records only.** `markRefundDone` flips `pending` to `done`. No money moves through the API.
- **Access:** buyer queries filter on `{ _id, buyer }` and seller queries on `{ _id, seller }`, so another user's order returns 404. Sellers never see `pending_payment` orders.
- **User deletion** is blocked by `hasUnfinishedOrders`: an order in progress, a delivered rental not yet returned, or a pending refund, as buyer or seller.

### WishlistItem (`wishlistitems` collection)

One saved product for one user.

| Field       | Type     | Notes                         |
| ----------- | -------- | ----------------------------- |
| `user`      | ObjectId | Owner of the wishlist         |
| `product`   | ObjectId | The saved product. Indexed    |
| `createdAt` | Date     | When it was saved             |

Indexes: unique `{ user, product }`, and `product`.

Rules, enforced in `wishlist.service.js`:

- **Add:** the product must pass `productService.findVisibleById`, and must not belong to the user. Adding twice returns the existing item. Two requests at once are resolved by the unique index.
- **List:** loads the user's items, then keeps only products that pass `publicFilter`. Hidden products stay saved and reappear when visible again. Paging is done in memory, because a wishlist holds at most 200 items (`MAX_WISHLIST_ITEMS`).
- **Flags:** `product.service.js` `withWishlistFlags` adds `isWishlisted` to store listing items and the product page when the request has a user.
- **Cleanup:** deleting a product removes its wishlist items. Deleting a user removes their wishlist, and the wishlist items for their products.

### Vendor (`vendors` collection)

A user's vendor application and its admin decision. One per user, enforced by a unique index on `user`. Re-applying after a rejection reuses the same document. It holds no store details.

| Field                 | Type     | Notes                                                        |
| --------------------- | -------- | ------------------------------------------------------------ |
| `user`                | ObjectId | Owner. Unique. Set from the token, never from the body       |
| `status`              | String   | `pending` (default), `approved`, `rejected` or `suspended`. Indexed |
| `subscriptionAtApply` | ObjectId | The B2B `UserSubscription` that made the user eligible       |
| `appliedAt`           | Date     | Time of the latest application                               |
| `applicationCount`    | Number   | 1 on first apply, incremented on each re-apply               |
| `reviewedBy`, `reviewedAt` | ObjectId, Date | Latest admin decision. Cleared on re-apply          |
| `approvedAt`          | Date     | Set on approval                                              |
| `statusReason`        | String   | Reason for a rejection or suspension. Shown to the user      |

Indexes: unique `user`, `status`, and `{ status, appliedAt }` for the admin queue.

Status transitions, enforced in `vendor.service.js`:

```
(none) --apply--> pending --approve--> approved --suspend--> suspended
                     |                     ^                     |
                     +--reject--> rejected |                     |
                                     |     +------reinstate------+
                                     +--apply--> pending
```

Rules:

- **Eligibility (`getEligibility`):** the user needs a `UserSubscription` with `status: 'active'` and `planSnapshot.audience: 'B2B'`. It is checked only on apply (403). Approval does not re-check it.
- **Product rule:** `MIN_PRODUCTS_TO_APPLY` is 5. `checkProductRequirement` counts the user's products with `isBlocked: false`. Hidden and out-of-stock products count. Like the subscription, it is checked only on apply (403), not on approval or afterwards.
- **Selling (`canSell`, `sellingUserIds`):** products may be shown in stores when the vendor is `approved`. The subscription is not checked after approval. The product module must use these helpers for every store listing.
- **Apply takes no body.** The request body is ignored, so `status` and `user` cannot be set by the client.
- **Concurrency:** two apply requests at once are resolved by the unique index. The loser gets 409.
- **User deletion:** `user.service.remove` deletes the vendor record.

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

## Billing flows (Razorpay)

### Subscription: first billing and autopay

```
App                          Server                                   Razorpay
 | POST /subscriptions {planId} |                                        |
 |----------------------------->| plan active? no live subscription?     |
 |                              | (an unpaid "created" one is abandoned) |
 |                              |--- subscriptions.create(plan_id, ----->|
 |                              |    total_count 120 or 10, notes)       |
 |                              | save UserSubscription {created, snapshot}
 |<---- {subscription, checkout}|                                        |
 | open Checkout(subscription_id) ------------------------------------->|
 |   user approves mandate; first cycle charged immediately            |
 |<---- {payment_id, subscription_id, signature} -----------------------|
 | POST /subscriptions/verify ->| HMAC(payment_id|subscription_id) check |
 |                              |--- subscriptions.fetch --------------->|
 |                              | applyRemote: status active, period     |
 |                              | record Payment, syncGrants (month 1)   |
 |<---- {subscription, balance} |                                        |
 |                              |                                        |
 |              every cycle     |<-- webhook subscription.charged -------| autopay charge
 |                              | applyRemote, record Payment, syncGrants|
 |                              |<-- subscription.pending / halted ------| charge failed
 |                              |<-- subscription.cancelled / completed -|
```

- **First billing:** `subscriptions.create` is called without `start_at`. Razorpay therefore charges the first cycle at authorisation and then auto-debits every cycle through the mandate (card, UPI AutoPay or eMandate).
- **Two paths for the first payment:** both the verify call and the webhook update the subscription. Whichever arrives first wins, and the other is a no-op.
- **`applyRemote`:** copies Razorpay's state onto ours, with two out-of-order guards. A terminal status is never reverted. A `paid_count` lower than ours is stale, so its status and period are ignored.
- **Cancel:** users and admins share `cancelSubscription(sub, { immediately, actor, adminId, reason })`.
  - By default an `active` subscription is cancelled with `cancel_at_cycle_end`. Razorpay keeps it `active` until the period ends, then sends `subscription.cancelled`.
  - Admins can pass `immediately: true` to end it now.
  - Any other live status is always cancelled immediately.
  - Granted credits are never removed.
- **Abandoned checkout:** if the user starts a subscription and never pays, it stays `created`. The next subscribe call cancels it in Razorpay and starts fresh.

### Monthly credit grants (`syncGrants`)

`syncGrants(sub, now)` runs only when `status === 'active'`. It walks the paid period `[currentPeriodStart, currentPeriodEnd)` in calendar months:

- **Windows:** month *k* runs from `start + k months` to `min(start + (k+1) months, periodEnd)`. Monthly plans have one window and yearly plans have twelve.
- **Grants:** every window that has started gets a lot of `planSnapshot.creditsPerMonth` that expires at the window end. The `grantKey` is `sub:<id>:<windowStart>`.
- **Callers:** it is idempotent, so checkout verify, every subscription webhook and the hourly job all call it.
- **Yearly drip:** for yearly plans, the hourly job grants each new month as it begins.
- **Month arithmetic:** `utils/date.addMonthsUTC` clamps the day, so 31 Jan + 1 month is 28 or 29 Feb.
- **Skipped windows:** a window that has already ended is skipped, because `grantCredits` ignores lots that are already expired.

### Credit pack purchase

```
App                             Server                                Razorpay
 | POST /credit-packs/:id/purchase |                                     |
 |-------------------------------->| requireActive (status 'active')     |
 |                                 | pack active?                        |
 |                                 |--- orders.create(amount paise) ---->|
 |                                 | Payment {created, packSnapshot}     |
 |<----- {payment, checkout} ------|                                     |
 | Checkout(order_id) ------------------------------------------------->|
 |<---- {order_id, payment_id, signature} ------------------------------|
 | POST /credit-packs/verify ----->| HMAC(order_id|payment_id) check     |
 |                                 | fulfillPackPayment: Payment paid,   |
 |                                 | grant snapshot credits, expiry =    |
 |                                 | paidAt + validityDays, key pack:<id>|
 |<----- {creditsAdded, balance} --|<-- webhook order.paid / payment.captured (fallback)
```

- **Fallback:** `payment.failed` marks the Payment failed. A later successful capture still fulfils it.
- **No re-check:** the subscription is not checked again at fulfilment, because the money has already been taken.

### Webhook endpoint

`POST /api/v1/webhooks/razorpay` is mounted in `app.js` **before** `express.json()`, with `express.raw()`, and outside `apiLimiter`.

1. **Signature:** an HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`, compared using `timingSafeEqual`. A failure returns 400.
2. **Dedupe:** by the `x-razorpay-event-id` header, or a body hash if it is missing. Processed or ignored events return 200 `duplicate`.
3. **Dispatch:** `subscription.*` events go to `applyRemote`, the payment record and `syncGrants`. `order.paid` and `payment.captured` look up the `Payment` by Razorpay order id and route by its `kind`: `credit_pack` goes to pack fulfilment, and `order` goes to `orderService.markPaidByRazorpayOrder`. `payment.failed` marks the pack payment or the product order as failed. Anything else is `ignored`.
4. **Failures:** a handler error is stored on the event and returns 500, so Razorpay retries.

### Scheduled job (`src/jobs/credits.job.js`)

node-cron runs two schedules, and all jobs also run once 10 seconds after startup:

- **Every 10 minutes:** `runGenerationRecovery` fails and refunds generations stuck in `processing`, and `runOrderExpiry` cancels unpaid online orders past their 30-minute deadline and releases their stock.
- **Minute 5 of every hour:** the credits job below.

- It runs `syncAllActive`, which calls `syncGrants` for every active subscription. This covers the yearly drip and any missed grant.
- It then runs `expireLots`.
- An in-process flag stops overlapping runs. Both steps are idempotent, so running on several instances is safe but wasteful. Set `JOBS_ENABLED=false` on extra instances.

## Virtual try-on generation

```
App                                 Server                                    VTON service
 | POST /generations/try-on           |                                          |
 | multipart: personImage, garmentImage                                          |
 |----------------------------------->| protect, generationLimiter (30/15 min per user)
 |                                    | multer: memory, JPEG/PNG/WebP, 10 MB each |
 |                                    | VTON_API_KEY set?          no  -> 503     |
 |                                    | balance >= 1?              no  -> 402     |
 |                                    | < 2 processing for user?   no  -> 429     |
 |                                    | Generation {processing}                  |
 |                                    | debitCredits(1, source generation)       |
 |                                    |   lost race for last credit -> delete generation, 402
 |                                    |--- POST multipart, Bearer key ---------->|
 |                                    |    (timeout VTON_TIMEOUT_MS)             |
 |                                    |<-- {success, data{status, outputImagePath, ...}}
 |                                    | completed -> save URLs                   |
 |<-- 201 {generation, balance} ------| anything else -> refundDebit, failed,    |
 |                                    |   502 (504 on timeout) with generationId |
```

- **Isolation:** `vton.service.js` is the only module that calls the VTON API. Tests swap `fetch` with `setFetchForTests`.
- **What counts as success:** `success: true`, `data.status === 'completed'` and an `outputImagePath`. Everything else is a failure and is refunded.
- **Synchronous:** the HTTP request stays open until VTON answers, which takes about 15 seconds in testing. If VTON becomes asynchronous later, the `processing` status and history endpoints are already in place for polling.
- **Stale recovery:** a generation still `processing` after 10 minutes, for example after a crash, is failed and refunded by the job every 10 minutes.
- **Image storage:** images are held in memory only for the length of the request. The VTON service stores the uploads and the output.

## File uploads

- **Parsing:** `middleware/upload.js` holds images in memory using multer.
  - `tryOnUpload` takes two files, which are forwarded to VTON.
  - `categoryImageUpload` takes one `image` file. `bannerImageUpload` is the same middleware under another name.
  - `productImagesUpload` takes up to 6 files in the `images` field.
  - All accept JPEG, PNG or WebP up to 10 MB per file.
  - Non-multipart requests pass straight through, so the same admin category routes also accept JSON.
- **Storage:** `services/storage.service.js` is the only module that touches stored files.
  - `saveImage(file, folder)` writes `UPLOADS_DIR/<folder>/<timestamp>-<random>.<ext>` and returns `/uploads/<folder>/<name>`.
  - `deleteFile(path)` never throws, and refuses paths outside `UPLOADS_DIR`.
  - `publicUrl(path)` prefixes `PUBLIC_BASE_URL`.
  - Moving to S3 or Cloudinary means changing only this module.
- **Serving:** `app.js` serves `UPLOADS_DIR` at `/uploads` with `express.static`.
  - Directory indexes and dotfiles are off, and files are cached for 7 days.
  - It sets `Cross-Origin-Resource-Policy: cross-origin`, because helmet's default would stop the app and admin panel from loading images across origins.
  - `/uploads` is outside `/api/v1`, so it is not rate limited.

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
| `optionalAuth` | For public routes. Sets `req.user` when a valid user token is sent. A missing, invalid, expired or admin token is ignored and the request continues as a guest |

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

The Razorpay webhook is not rate limited. It is protected by its signature instead.

`generationLimiter` allows 30 try-on requests per 15 minutes **per user**, keyed by user id. Separately, a user can have at most 2 generations `processing` at once, which returns 429.

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
| `JOBS_ENABLED`       | `true`        | Run the scheduled jobs in this process |
| `PUBLIC_BASE_URL`    | `http://localhost:<PORT>` | Public address of the API, used to build `imageUrl`. Trailing slashes are removed |
| `UPLOADS_DIR`        | `uploads`     | Folder for uploaded files, relative to the working directory or absolute |
| `VTON_API_URL`       | `https://vton.feelvie.com/api/v1/tryon/generate` | Try-on endpoint |
| `VTON_API_KEY`       | empty         | Bearer token for the try-on API. Without it, generation returns 503 and nothing is charged |
| `VTON_TIMEOUT_MS`    | `120000`      | Try-on request timeout. Timeouts are refunded and return 504 |
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
- **No database transactions.** Multi-document writes, such as a lot plus a wallet update or a payment plus a grant, are sequenced and made idempotent instead. Recovery comes from idempotent retries by webhooks and the job, not from rollback. MongoDB transactions would need a replica set.
- **No plan changes mid-subscription.** There is no upgrade, downgrade or proration. Users cancel, wait for the period to end, then subscribe again.
- **No GST invoices.** Prices are INR inclusive. Razorpay's own receipts are the only invoices.
- **No refunds API.** Refunds are made from the Razorpay dashboard and do not claw back credits automatically. Use the admin debit endpoint if needed.
- **Try-on is synchronous.** Each request holds a connection open for about 15 to 120 seconds. Under heavy load, move it to a queue and let the app poll `GET /generations/:id`.
- **No image hosting of our own for try-on.** Generation history points to URLs hosted by the VTON service. If that service deletes old uploads, history images stop loading.
- **Category images are on local disk.** This works for a single server. Several instances need a shared volume, or `storage.service.js` must be switched to S3 or Cloudinary. Back up `UPLOADS_DIR` together with the database.
- **No image resizing.** Category images are stored as uploaded, up to 10 MB. Consider resizing or converting to WebP before launch.
- **Vendor conditions are checked only at application time.** A vendor who later deletes products or loses the B2B subscription stays approved.
- **The subscription rule differs between listings.** The vendor store page hides a vendor's products when their B2B subscription is not active, but the main listing, the product page and ordering still allow them.
- **No cart.** One order is one product. Buying several products means several orders and several payments.
- **Rentals have no date availability.** A rented piece is out of stock from the order until it is marked returned, whatever the dates. It cannot be booked for a later date in between.
- **Order refunds are manual.** The API records what is owed and that it was paid. An admin moves the money in the Razorpay dashboard. There is no partial-refund amount field, only a note.
- **No delivery charge, tax, vendor payouts or late-return fees.** The order total is the item price, plus the deposit for rentals.
- **No notifications.** Buyers and sellers are not told about order changes. The app has to poll.
- **Editing sizes can overwrite reserved stock.** A seller who replaces the `sizes` list while an order is being placed sets the stock to what they send.
- **Product search is a regex scan.** It is fine for a small catalogue. Add a text or search index before the catalogue grows.
- **Store queries load all category and approved-vendor ids** on each request to build the visibility filter. Cache them if either list grows large.
- **Product and banner images share the category image limits:** local disk, no resizing, up to 10 MB each.
- **Banner targets are not checked.** `screenName` and `slug` are stored as typed. The server does not know the app's screens, and does not check that the slug belongs to a real category or product.
- **Banners have no schedule.** There are no start or end dates. An admin turns a banner on and off with `isActive`.
- **Vendors have no profile.** An application records only the user, the status and the latest admin decision. There are no store details, documents or payout account, and no review history beyond the latest decision.
- **Vendor approval outlives the subscription.** The B2B subscription is checked only on apply. An approved vendor keeps selling after it ends, until an admin suspends them.
- **Deleting a user is blocked while a subscription is live.** An admin must cancel it immediately first.
