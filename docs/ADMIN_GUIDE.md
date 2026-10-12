# Feelvie Admin API Guide

How to use the admin API to manage Feelvie. This guide is for admin panel developers and operators. The app API used by end users is documented separately in `FRONTEND_GUIDE.md`.

This file is updated whenever an admin endpoint, request shape or response shape changes.

_Last updated: 2026-10-12_

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

Deleting a user cannot be undone. A user who still has a subscription that is not cancelled cannot be deleted, and the request returns **409**. Otherwise Razorpay would keep charging them. Cancel it first with `POST /subscriptions/:id/cancel` and `immediately: true`.

## User subscriptions

Users subscribe from the app through Razorpay. These endpoints let you see who is subscribed and the state of each subscription.

### List subscriptions

`GET /subscriptions?status=active&userId=<user id>&page=1&limit=20`. Both filters are optional. Newest first. `user` is expanded to `{ _id, phone, name, email }`.

```json
{
  "items": [
    {
      "_id": "6ac0f5005079aaf00c50eb00",
      "user": { "_id": "6ac0c8425e44be9e0d7a5146", "phone": "+919876543210", "name": "Test User" },
      "plan": "6ac0e1a05079aaf00c50e701",
      "planSnapshot": {
        "name": "Pro Monthly",
        "audience": "B2C",
        "billingCycle": "monthly",
        "originalPriceInr": 999,
        "offerPriceInr": 499,
        "creditsPerMonth": 100
      },
      "razorpaySubscriptionId": "sub_PbQ9abc123",
      "status": "active",
      "currentPeriodStart": "2026-10-03T10:00:00.000Z",
      "currentPeriodEnd": "2026-11-03T10:00:00.000Z",
      "paidCount": 1,
      "totalCount": 120,
      "startedAt": "2026-10-03T10:00:00.000Z",
      "cancelAtPeriodEnd": false,
      "lastPaymentId": "pay_PbQAxyz789",
      "createdAt": "2026-10-03T09:59:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pages": 1
}
```

`planSnapshot` holds the terms the user bought. Later edits to the plan do not change it.

### Subscription statuses

| `status`        | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| `created`       | Started but Checkout not completed. Nothing charged               |
| `authenticated` | Mandate approved, first charge processing                         |
| `active`        | Paid for the current period. Credits are being granted            |
| `pending`       | A renewal charge failed. Razorpay is retrying. No new credits     |
| `halted`        | All retries failed. No new credits until payment succeeds         |
| `paused`        | Paused from the Razorpay dashboard                                |
| `cancelled`     | Ended by the user or from the dashboard                           |
| `completed`     | All billing cycles charged: 120 months, or 10 years               |
| `expired`       | Ended by Razorpay                                                 |

`cancelAtPeriodEnd: true` means the user cancelled. They keep access until `currentPeriodEnd` and are not charged again.

### View one subscription

`GET /subscriptions/:id` returns `{ subscription, payments }`. `payments` lists every charge for that subscription, with `razorpayPaymentId`, `amountInr`, `status` and `paidAt`.

### Cancel a user's subscription

`POST /subscriptions/:id/cancel`, where `:id` is the subscription `_id`, not the Razorpay id.

| Field         | Required | Type    | Meaning                                                    |
| ------------- | -------- | ------- | ---------------------------------------------------------- |
| `reason`      | Yes      | string  | Saved on the subscription as `cancelReason`                |
| `immediately` | No       | boolean | Default `false`. See below                                 |

What happens:

| Subscription status | `immediately: false` (default)                     | `immediately: true`                 |
| ------------------- | -------------------------------------------------- | ----------------------------------- |
| `active`            | Ends at `currentPeriodEnd`. No further charges. The user keeps access until then | Ends now. Razorpay stops billing at once |
| `created`, `authenticated`, `pending`, `halted`, `paused` | Ends now | Ends now |
| Already ended       | 400 `This subscription has already ended`          | Same                                |

- Credits already granted are never removed. They stay usable until they expire. To take credits back, use `POST /users/:id/credits` with `action: "debit"`.
- A subscription already set to end at the period end can still be ended immediately by sending `immediately: true`.
- No refund is issued. Refunds are made from the Razorpay dashboard.
- After an immediate cancel, the user can be deleted.

Example:

```json
{ "reason": "Customer asked to stop billing", "immediately": true }
```

Response `200` returns the updated subscription. The message is either `Subscription cancelled` or `Subscription will end at the end of the current period`. The subscription records who cancelled it:

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| `cancelledBy`      | `user`, `admin`, or `razorpay` when cancelled from the Razorpay dashboard |
| `cancelledByAdmin` | Your admin id, for admin cancellations                    |
| `cancelReason`     | The reason you gave                                       |
| `cancelledAt`      | When it was cancelled                                     |

## Categories

Categories form a tree up to **3 levels** deep, linked by `parentId`. For example: Women (level 1) → Topwear (level 2) → T-Shirts (level 3). Top-level categories have `parentId: null`.

### Category fields

| Field         | Required | Type    | Rules                                                          |
| ------------- | -------- | ------- | -------------------------------------------------------------- |
| `title`       | Yes      | string  | Max 100 chars                                                  |
| `slug`        | No       | string  | Lowercase letters, numbers and single hyphens, max 80. Unique across all categories. Created from the title if not sent: "T-Shirts & Polo's" becomes `t-shirts-polos`, and `-2`, `-3` and so on are added if it is taken |
| `parentId`    | No       | id      | Empty or `null` for a top-level category. The parent must be level 1 or 2 |
| `image`       | No       | file    | JPEG, PNG or WebP, up to 10 MB. Uploaded as a file, see below  |
| `description` | No       | string  | Max 1000 chars                                                 |
| `sortOrder`   | No       | integer | Default `0`. Lower numbers show first. Ties are sorted by title |
| `isActive`    | No       | boolean | Default `true`                                                 |

The server also returns these fields:
- `_id`, `level` (1 to 3), and `ancestors` (parent ids, top level first).
- `image`, the stored path, and `imageUrl`, the full URL to display, or `null`.
- `createdBy`, `updatedBy`, `createdAt` and `updatedAt`.

### Create a category

`POST /categories` as **`multipart/form-data`**. This is required when sending an image. All fields are sent as text form fields, plus an optional `image` file:

```js
const form = new FormData();
form.append('title', 'T-Shirts');
form.append('parentId', topwearId);   // omit or leave empty for a top-level category
form.append('sortOrder', '1');
form.append('description', 'Casual and graphic tees');
form.append('image', fileInput.files[0]);

await fetch('/api/v1/admin/categories', {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` }, // let the browser set Content-Type
  body: form,
});
```

Without an image you can send plain JSON instead: `{ "title": "Kids", "sortOrder": 3 }`.

Response `201`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Category created",
  "data": {
    "_id": "6ac1001a5079aaf00c50f000",
    "title": "T-Shirts",
    "slug": "t-shirts",
    "description": "Casual and graphic tees",
    "image": "/uploads/categories/1791024000000-3f9c1a2b4d5e6f70.png",
    "imageUrl": "https://api.feelvie.com/uploads/categories/1791024000000-3f9c1a2b4d5e6f70.png",
    "parentId": "6ac0fff05079aaf00c50eff0",
    "ancestors": ["6ac0ffe05079aaf00c50efe0", "6ac0fff05079aaf00c50eff0"],
    "level": 3,
    "isActive": true,
    "sortOrder": 1,
    "createdBy": "6ac0d1ae5079aaf00c50e634",
    "updatedBy": "6ac0d1ae5079aaf00c50e634",
    "createdAt": "2026-10-03T11:00:00.000Z",
    "updatedAt": "2026-10-03T11:00:00.000Z"
  }
}
```

### Edit a category

`PATCH /categories/:id`, as multipart or JSON. Send only what changes:

| Send                         | Effect                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| `title`                      | Changes the title. The slug does **not** change, so links keep working. Send `slug` too if you want a new one |
| `slug`                       | Changes the slug. 409 if another category uses it               |
| `image` file                 | Replaces the image. The old file is deleted                     |
| `removeImage: true`          | Removes the image                                              |
| `parentId`                   | **Moves** the category, and everything under it, to a new parent. Send empty or `null` to make it top-level |
| `isActive`, `sortOrder`, `description` | Updates that field                                   |

Moving rules:
- A category cannot be moved under itself or under one of its own subcategories (400).
- A move must not make the tree deeper than 3 levels (400). For example, a level 1 category that has grandchildren cannot be moved under anything.

### Delete (deactivate)

`DELETE /categories/:id` never removes data. It sets `isActive: false` on the category **and every subcategory under it**. The response shows how many were deactivated:

```json
{ "category": { "...": "..." }, "deactivated": 4 }
```

To bring categories back, use `PATCH` with `isActive: true` on each one you want. Reactivating a parent does **not** reactivate its subcategories. The app only shows a category when it and all its parents are active, so an active subcategory under an inactive parent stays hidden.

### List and view

- `GET /categories?parentId=root&level=2&isActive=true&search=shirt&page=1&limit=20` gives a flat, paginated list. All filters are optional:
  - `parentId`: a category id, or `root` for top-level only.
  - `level`: 1, 2 or 3.
  - `search`: matches the title, ignoring case.
- `GET /categories/tree` returns the whole tree, including inactive categories. Each node has `isActive` and `children`.
- `GET /categories/:id` returns:
  - `category`
  - `breadcrumb`: its parents, top level first.
  - `children`: its direct subcategories.
  - `descendantCount`: how many categories sit under it at any depth.

### Category errors

| Status | `message`                                                    |
| ------ | ------------------------------------------------------------ |
| 400    | `Validation failed`. `details` lists each problem, for example `title is required` |
| 400    | `Categories can only be nested 3 levels deep`                |
| 400    | `A category cannot be moved under itself or one of its subcategories` |
| 400    | `This move would make the tree deeper than 3 levels...`      |
| 400    | `image must be a JPEG, PNG or WebP image` / `Each image must be 10 MB or smaller` |
| 400    | `Could not build a slug from this title. Send a slug`        |
| 404    | `Category not found` / `Parent category not found`           |
| 409    | `The slug "..." is already used by another category`         |

### Image storage

Images are saved on the server disk in the `UPLOADS_DIR` folder (default `uploads/`) and served at `/uploads/...`. `imageUrl` is built from `PUBLIC_BASE_URL`. Set it to the public address of the API in each environment, for example `https://api.feelvie.com`. Back up the uploads folder with the database. If the server runs on several machines, they need a shared disk, or the storage should move to S3 or Cloudinary.

## Banners

A banner is an image shown in the mobile app. When the user taps it, the app opens the screen named in `screenName`, and passes `slug` to that screen if you set one. For example, `screenName: "CategoryProducts"` with `slug: "dresses"` opens the Dresses category.

### Banner fields

| Field        | Required | Type    | Rules                                                          |
| ------------ | -------- | ------- | -------------------------------------------------------------- |
| `image`      | Yes on create | file | JPEG, PNG or WebP, up to 10 MB. Uploaded as a file, see below |
| `screenName` | Yes      | string  | The app screen to open, max 100 chars. Use the exact name the app developers give you. The server does not check it |
| `slug`       | No       | string  | Lowercase letters, numbers and single hyphens, max 80. Usually a category or product slug. Several banners can use the same slug. The server does not check that it exists |
| `title`      | No       | string  | A label, max 100 chars                                         |
| `sortOrder`  | No       | integer | Default `0`. Lower numbers show first. Ties show the newest first |
| `isActive`   | No       | boolean | Default `true`. The app only shows active banners              |

The server also returns `_id`, `image` (the stored path), `imageUrl` (the full URL to display), `createdBy`, `updatedBy`, `createdAt` and `updatedAt`.

### Create a banner

`POST /banners` as **`multipart/form-data`**, with the fields as text form fields and the `image` file:

```js
const form = new FormData();
form.append('image', fileInput.files[0]);
form.append('screenName', 'CategoryProducts');
form.append('slug', 'dresses');
form.append('title', 'Festive sale');
form.append('sortOrder', '0');

await fetch('/api/v1/admin/banners', {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` }, // let the browser set Content-Type
  body: form,
});
```

Response `201`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Banner created",
  "data": {
    "_id": "6ad2001a5079aaf00c510000",
    "title": "Festive sale",
    "image": "/uploads/banners/1791800000000-9a8b7c6d5e4f3021.webp",
    "imageUrl": "https://api.feelvie.com/uploads/banners/1791800000000-9a8b7c6d5e4f3021.webp",
    "slug": "dresses",
    "screenName": "CategoryProducts",
    "isActive": true,
    "sortOrder": 0,
    "createdBy": "6ac0d1ae5079aaf00c50e634",
    "updatedBy": "6ac0d1ae5079aaf00c50e634",
    "createdAt": "2026-10-12T11:00:00.000Z",
    "updatedAt": "2026-10-12T11:00:00.000Z"
  }
}
```

### Edit a banner

`PATCH /banners/:id`, as multipart or JSON. Send only what changes:

| Send                         | Effect                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| `image` file                 | Replaces the image. The old file is deleted. Needs multipart   |
| `screenName`                 | Changes the screen. It cannot be emptied                       |
| `slug`, `title`              | Changes the field. Send an empty value to clear it             |
| `isActive`, `sortOrder`      | Updates that field. Use `isActive: false` to hide a banner without deleting it |

A banner always has an image. It can be replaced but not removed.

### Delete a banner

`DELETE /banners/:id` removes the banner **and its image file** for good. To hide a banner for a while, use `PATCH` with `isActive: false` instead.

### List and view

- `GET /banners?isActive=true&page=1&limit=20` gives a paginated list in display order. `isActive` is optional.
- `GET /banners/:id` returns one banner.

### Banner errors

| Status | `message`                                                    |
| ------ | ------------------------------------------------------------ |
| 400    | `Validation failed`. `details` lists each problem, for example `screenName is required` or `image is required` |
| 400    | `image must be a JPEG, PNG or WebP image` / `Each image must be 10 MB or smaller` |
| 404    | `Banner not found`                                           |

Banner images are stored like category images, under `UPLOADS_DIR/banners`. See "Image storage".

## Products

Users add dresses for sale or for rent. Products need no approval of their own. They appear in stores as soon as their owner is an approved vendor. Admins moderate by blocking individual products, or by suspending the vendor to hide everything they sell.

### List and view

`GET /products?owner=<userId>&listingType=sale&isBlocked=false&isActive=true&search=gown&page=1&limit=20` lists every product, newest first. All filters are optional.

| Filter        | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `owner`       | A user id. Shows that user's products                  |
| `listingType` | `sale` or `rent`                                       |
| `isBlocked`   | `true` or `false`                                      |
| `isActive`    | The owner's own show or hide switch                    |
| `search`      | Matches the title or brand                             |

Each item includes the owner's `phone`, `name` and `email`, and the category's `title` and `slug`.

`GET /products/:id` returns one product for review:

```json
{
  "product": {
    "_id": "6ac1b0105079aaf00c510001",
    "owner": { "_id": "6ac0c8425e44be9e0d7a5146", "phone": "+919876543210", "name": "Asha", "isActive": true },
    "title": "Red Silk Gown",
    "slug": "red-silk-gown",
    "category": { "_id": "6ac1000a5079aaf00c50f000", "title": "Dresses", "slug": "dresses", "isActive": true },
    "listingType": "sale",
    "sale": { "originalPriceInr": 5000, "priceInr": 3000 },
    "sizes": [{ "size": "S", "stock": 2 }],
    "totalStock": 2,
    "imageUrls": ["https://api.feelvie.com/uploads/products/1791030000000-3f9c1a2b4d5e6f70.jpg"],
    "isActive": true,
    "isBlocked": false
  },
  "vendorStatus": "approved",
  "visibleInStore": true
}
```

- `vendorStatus` is the owner's vendor status, or `not_applied`.
- `visibleInStore` says whether shoppers can see the product right now. It is `false` when the owner is not an approved vendor, the owner hid it, it is blocked, or its category is deactivated.

### Block and unblock

| Action  | Request                                                   | Result                                        |
| ------- | --------------------------------------------------------- | --------------------------------------------- |
| Block   | `POST /products/:id/block` with `{ "reason": "..." }`     | Hidden from stores. The owner sees the reason |
| Unblock | `POST /products/:id/unblock`                              | Visible again, if the other conditions hold   |

- `reason` is required. Blocking records `blockedBy` (your admin id) and `blockedAt`.
- The owner can still edit a blocked product, but cannot unblock it.
- Admins cannot edit or delete a user's product. Deleting a user deletes their products and image files.

Product images are stored like category images, under `UPLOADS_DIR/products`. See "Image storage".

### Product errors

| Status | `message`                           | When                              |
| ------ | ----------------------------------- | --------------------------------- |
| 400    | `Validation failed`                 | `reason` missing on block, or a bad filter |
| 400    | `This product is already blocked`   |                                   |
| 400    | `This product is not blocked`       | Unblock on a product that is not blocked |
| 404    | `Product not found`                 |                                   |

## Orders

Shoppers buy or rent one product per order. The seller who owns the product moves the order through its steps. Admins can see every order, move or cancel any of them, and record refunds.

### Order statuses

| Status            | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `pending_payment` | Online order waiting for payment. Cancelled by the system if unpaid after 30 minutes |
| `placed`          | Paid online, or a cash-on-delivery order. Waiting for the seller    |
| `confirmed`       | Accepted by the seller                                              |
| `shipped`         | On its way                                                          |
| `delivered`       | Received. COD orders are marked paid here                           |
| `returned`        | Rentals only. The piece is back with the seller and back in stock   |
| `cancelled`       | See `cancelledBy` (`buyer`, `seller`, `admin` or `system`) and `cancelReason` |

### List and view

`GET /orders?status=placed&type=rent&paymentMethod=online&refundStatus=pending&buyer=<userId>&seller=<userId>&page=1&limit=20` lists orders, newest first. All filters are optional. Each item includes the buyer's and seller's `phone`, `name` and `email`.

`GET /orders/:id` returns `{ "order": { ... }, "payment": { ... } }`. `payment` is the Razorpay payment record, or `null` for COD. The order includes `statusHistory`, `shippingAddress`, `pricing`, and `rental` for rentals.

### Move an order forward

`PATCH /orders/:id/status` with `{ "status": "confirmed" }`. Steps must go in order: `confirmed`, `shipped`, `delivered`, and `returned` for rentals. Use this when a seller is not updating their order.

- Marking a COD order `delivered` marks it paid.
- Marking a rental `returned` puts the piece back in stock and creates a pending refund for the security deposit.

### Cancel an order

`POST /orders/:id/cancel` with a required `{ "reason": "..." }`. It works on any order that is not yet delivered. The stock is put back. If the order was already paid, a refund of the full amount becomes pending.

### Refunds

Refunds are **paid out by hand**. The API does not move money.

1. Find orders that are owed money with `GET /orders?refundStatus=pending`. Each has `refund.amountInr` and `refund.reason`.
2. Pay the buyer: refund the payment in the Razorpay dashboard using `payment.razorpayPaymentId`, or pay another way for a deposit.
3. Record it with `POST /orders/:id/refund-done` and an optional `{ "note": "Razorpay refund rfnd_123" }`. The refund becomes `done`, with your admin id and the time.

A refund becomes pending in three cases:

| Case                                         | Amount              |
| -------------------------------------------- | ------------------- |
| A paid order is cancelled                    | The full total      |
| A rental is marked returned                  | The security deposit |
| A payment arrives after the order was cancelled or expired | The full total |

To keep part of a deposit for damage, pay the reduced amount and say so in `note`.

### Orders and deleting users

A user cannot be deleted (409) while they are the buyer or seller of an order that is still in progress, a rental that is delivered but not returned, or an order with a pending refund. Finish or cancel those first.

### Order errors

| Status | `message`                                              | When                                   |
| ------ | ------------------------------------------------------ | -------------------------------------- |
| 400    | `Validation failed`                                    | Bad filter, bad status, or `reason` missing on cancel |
| 400    | `This order is placed. The next step is confirmed`     | A step was skipped                     |
| 400    | `This order is pending_payment and has no further steps` | The order is unpaid, finished or cancelled |
| 400    | `An order that is delivered cannot be cancelled`       |                                        |
| 400    | `This order is already cancelled`                      |                                        |
| 400    | `This order has no pending refund`                     | `refund-done` on an order with nothing owed |
| 404    | `Order not found`                                      |                                        |
| 409    | `This order was just updated by someone else. Please refresh and try again` | Two changes at the same moment |

## Vendors

Users who want to sell their dresses apply to become vendors. An admin reviews each application. A vendor's products are shown in stores only while the vendor is `approved`.

Conditions a user must meet to apply:

1. An active B2B subscription.
2. At least 5 products added. Products you have blocked do not count.

### Vendor statuses

| Status      | Meaning                                    | Actions available          |
| ----------- | ------------------------------------------ | -------------------------- |
| `pending`   | Applied, waiting for review                | Approve, reject            |
| `approved`  | Can sell                                   | Suspend                    |
| `rejected`  | Rejected. The user can apply again         | None until they re-apply   |
| `suspended` | Blocked. The user cannot apply again       | Reinstate                  |

### List and view

- `GET /vendors?status=pending&page=1&limit=20` lists applications, newest first. `status` is optional. Each item includes the user's `phone`, `name`, `email` and `isActive`.
- `GET /vendors/:id` returns one vendor for review:

```json
{
  "vendor": {
    "_id": "6ac1a0105079aaf00c50f001",
    "user": { "_id": "6ac0c8425e44be9e0d7a5146", "phone": "+919876543210", "name": "Asha", "email": "asha@example.com", "isActive": true },
    "status": "pending",
    "subscriptionAtApply": "6ac0f0005079aaf00c50e800",
    "appliedAt": "2026-10-03T12:00:00.000Z",
    "applicationCount": 1
  },
  "eligibility": {
    "hasActiveB2BSubscription": true,
    "products": { "required": 5, "enforced": true, "count": 6, "met": true },
    "eligible": true,
    "unmet": []
  },
  "subscription": { "_id": "6ac0f0005079aaf00c50e800", "status": "active", "planSnapshot": { "name": "Team", "audience": "B2B" } },
  "canSell": false
}
```

`eligibility` and `subscription` are the user's situation **now**, not when they applied. They are shown for information only. `subscription` is `null` when the user no longer has an active B2B subscription. `applicationCount` above 1 means the user applied again after a rejection.

### Review actions

| Action    | Request                                                        | Allowed when | Result                              |
| --------- | -------------------------------------------------------------- | ------------ | ----------------------------------- |
| Approve   | `POST /vendors/:id/approve`                                    | `pending`    | `approved`. Sets `approvedAt`       |
| Reject    | `POST /vendors/:id/reject` with `{ "reason": "..." }`          | `pending`    | `rejected`. The user sees the reason |
| Suspend   | `POST /vendors/:id/suspend` with `{ "reason": "..." }`         | `approved`   | `suspended`. Products are hidden    |
| Reinstate | `POST /vendors/:id/reinstate`                                  | `suspended`  | `approved`                          |

- `reason` is required for reject and suspend. It is saved as `statusReason` and shown to the user in the app.
- Every action records `reviewedBy` (your admin id) and `reviewedAt`.
- The B2B subscription is checked only when the user applies. Approval does not check it again, and an approved vendor stays able to sell if the subscription later ends. Suspend the vendor to stop them selling.
- Deleting a user also deletes their vendor record.

### Vendor errors

| Status | `message`                                                              | When                                  |
| ------ | ---------------------------------------------------------------------- | ------------------------------------- |
| 400    | `Validation failed`                                                    | `reason` missing on reject or suspend |
| 400    | `Only a pending application can be approved. This one is rejected`     | The action does not fit the current status. The same pattern applies to reject, suspend and reinstate |
| 400    | `This vendor is already approved`                                      | Approve called twice                  |
| 404    | `Vendor not found`                                                     |                                       |

## Generations (virtual try-on)

Every try-on request a user makes is saved, whether it succeeds or fails. Each one costs the user 1 credit, and failures are refunded automatically.

- `GET /generations?status=failed&userId=<user id>&page=1&limit=20` lists generations. Both filters are optional, and `status` can be `processing`, `completed` or `failed`. Newest first. `user` is expanded to `{ _id, phone, name, email }`.
- `GET /generations/:id` returns one generation.

Generation fields:

| Field               | Meaning                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `status`            | `processing`, `completed` or `failed`                            |
| `personImageUrl`, `garmentImageUrl`, `outputImageUrl` | Images hosted on the try-on service. Output is only set when completed |
| `providerJobId`     | The try-on service's job id, for tracing a request with that team |
| `creditsCharged`, `creditsRefunded` | 1 and 0 when completed. 1 and 1 when failed      |
| `debitTransaction`, `refundTransaction` | The matching wallet transactions                 |
| `error`             | Why it failed                                                    |
| `durationMs`        | How long the try-on service took                                 |

**Stuck generations:** if the server restarts while a generation is running, it stays `processing`. Within about 10 minutes the scheduled job marks it `failed` with "Generation did not finish" and refunds the credit.

In a user's wallet history, generation charges appear as `debit` transactions with `source: "generation"`. Refunds appear as `refund` transactions. If the credit being refunded has expired in the meantime, the user gets a replacement credit valid for 7 days, with `source: "refund"`.

### Try-on service configuration

| Env var           | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `VTON_API_URL`    | Defaults to `https://vton.feelvie.com/api/v1/tryon/generate`   |
| `VTON_API_KEY`    | Bearer token for the try-on service. Without it, generation returns 503 and nothing is charged |
| `VTON_TIMEOUT_MS` | Default `120000` (2 minutes). Slower requests are refunded and return 504 |

## Razorpay setup

These steps are done once per environment by whoever deploys the server.

1. **API keys:** in the Razorpay dashboard, go to **Settings → API Keys** and generate a key. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the server. Use test mode keys (`rzp_test_...`) outside production.
2. **Subscriptions:** confirm that Subscriptions is enabled on the Razorpay account.
3. **Webhook:** in **Settings → Webhooks**, add a webhook:
   - URL: `https://<your-api-domain>/api/v1/webhooks/razorpay`
   - Secret: any long random string. Set the same value as `RAZORPAY_WEBHOOK_SECRET` on the server.
   - Active events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.paused`, `subscription.resumed`, `subscription.cancelled`, `subscription.completed`, `subscription.updated`, `payment.captured`, `payment.failed` and `order.paid`.
4. Restart the server and create plans from the admin API. Each plan appears in the Razorpay dashboard under **Subscriptions → Plans**.

The webhook is how renewals reach the server. Without it, the first payment works through the app's verify call, but monthly renewals and failed-payment updates never arrive.

For local testing, expose the server with a tunnel such as ngrok and use its URL for the webhook. In test mode, use card `4111 1111 1111 1111` with any future expiry and CVV, or UPI ID `success@razorpay`.

## User wallets and credits

Each user has a wallet. Credits are stored as lots. Every lot has `creditsAdded`, `creditsRemaining` and an expiry date `expiresOn`. Spending uses the lot that expires first.

### View a user's wallet

`GET /users/:id/wallet` returns the same shape the app sees:
- `balance`: credits the user can spend right now.
- `nextExpiry`: the next lot to expire.
- `activeLots`: lots with credits left, earliest expiry first.
- `wallet`: lifetime totals for credited, debited and expired.

`GET /users/:id/wallet/transactions?type=credit&page=1&limit=20` lists the full history. `type` is optional and can be `credit`, `debit`, `expire` or `refund`.

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

Credit packs are one-off purchases that add credits on top of a subscription. Users can only buy a pack while their subscription status is `active`. Pending, halted and unpaid subscriptions do not qualify. Credits from a pack stay usable until they expire, even if the subscription ends. Packs are not created in Razorpay. An order is created at the time of each purchase.

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
| GET    | `/subscriptions`    | Admin token | List user subscriptions      |
| GET    | `/subscriptions/:id` | Admin token | A subscription and its payments |
| POST   | `/subscriptions/:id/cancel` | Admin token | Cancel a user's subscription |
| GET    | `/categories`       | Admin token | List categories (flat, filters) |
| GET    | `/categories/tree`  | Admin token | Full tree including inactive |
| GET    | `/categories/:id`   | Admin token | Category with breadcrumb and children |
| POST   | `/categories`       | Admin token | Create (multipart with image, or JSON) |
| PATCH  | `/categories/:id`   | Admin token | Edit, replace image, move    |
| DELETE | `/categories/:id`   | Admin token | Deactivate with all subcategories |
| GET    | `/banners`          | Admin token | List banners                 |
| GET    | `/banners/:id`      | Admin token | One banner                   |
| POST   | `/banners`          | Admin token | Create (multipart with image) |
| PATCH  | `/banners/:id`      | Admin token | Edit, replace image          |
| DELETE | `/banners/:id`      | Admin token | Delete a banner and its image |
| GET    | `/products`         | Admin token | List all products (filters)  |
| GET    | `/products/:id`     | Admin token | One product with vendor status and store visibility |
| POST   | `/products/:id/block` | Admin token | Hide a product, with a reason |
| POST   | `/products/:id/unblock` | Admin token | Show a blocked product again |
| GET    | `/orders`           | Admin token | List all orders (filters)    |
| GET    | `/orders/:id`       | Admin token | One order with its payment   |
| PATCH  | `/orders/:id/status` | Admin token | Move an order to its next step |
| POST   | `/orders/:id/cancel` | Admin token | Cancel an order, with a reason |
| POST   | `/orders/:id/refund-done` | Admin token | Record that a refund was paid |
| GET    | `/vendors`          | Admin token | List vendor applications     |
| GET    | `/vendors/:id`      | Admin token | One vendor with the user and current eligibility |
| POST   | `/vendors/:id/approve` | Admin token | Approve a pending application |
| POST   | `/vendors/:id/reject` | Admin token | Reject with a reason        |
| POST   | `/vendors/:id/suspend` | Admin token | Suspend an approved vendor |
| POST   | `/vendors/:id/reinstate` | Admin token | Reinstate a suspended vendor |
| GET    | `/generations`      | Admin token | List try-on generations      |
| GET    | `/generations/:id`  | Admin token | One generation               |

## Changelog for admins

| Date       | Change                                                        |
| ---------- | ------------------------------------------------------------- |
| 2026-10-12 | Banners added: upload a mobile banner image with the screen it opens (`screenName`) and an optional `slug`, then list, edit, hide or delete it. |
| 2026-10-03 | Orders added: list and view every order, move or cancel any order, and record manual refunds. Users with unfinished orders or a pending refund cannot be deleted (409). The Razorpay webhook now also confirms product order payments, using the same events as credit packs. |
| 2026-10-03 | The 5-product rule for vendor applications is now enforced. Blocked products do not count towards it. The rule is checked only when the user applies. |
| 2026-10-03 | Products added: list and view every product, and block or unblock one with a reason. Products of users who are not approved vendors stay hidden from stores. Deleting a user deletes their products and images. |
| 2026-10-03 | Vendors simplified: applications carry no store or contact details, the `search` filter is removed, and approve no longer re-checks the B2B subscription. An approved vendor keeps selling if the subscription ends. |
| 2026-10-03 | Vendors added: review applications with approve, reject, suspend and reinstate. Deleting a user deletes their vendor record. |
| 2026-10-03 | Categories added: up to 3 levels, image upload, automatic slugs, moving whole subtrees, and delete that deactivates a whole subtree. New env vars `PUBLIC_BASE_URL` and `UPLOADS_DIR`. |
| 2026-10-03 | Virtual try-on generations added: list and view them. Wallet history now shows `generation` debits and `refund` transactions. New env vars `VTON_API_URL`, `VTON_API_KEY` and `VTON_TIMEOUT_MS`. |
| 2026-10-03 | Admins can cancel a user's subscription, either at the period end or immediately, with a reason. Subscriptions now record `cancelledBy`, `cancelledByAdmin` and `cancelReason`. |
| 2026-10-03 | User subscriptions list and detail added, and a Razorpay setup section. Users with a live subscription can no longer be deleted (409). |
| 2026-10-03 | User wallets added. View a user's wallet and history, and grant or debit credits manually. |
| 2026-10-03 | Subscription plans and credit packs added, with create, list, view, edit and deactivate. |
| 2026-10-03 | Admin model and login added. User list, view and delete moved here from the app API. |
