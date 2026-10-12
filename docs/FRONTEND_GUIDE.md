# Feelvie API: Frontend Integration Guide

How to call the Feelvie backend from the app. This file is updated whenever an endpoint, request shape or response shape changes.

_Last updated: 2026-10-12_

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
| POST   | `/subscriptions`   | Bearer token  | Start a subscription, returns Checkout options |
| POST   | `/subscriptions/verify` | Bearer token | Confirm the first payment from Checkout |
| GET    | `/subscriptions/me` | Bearer token | My current subscription and history |
| POST   | `/subscriptions/cancel` | Bearer token | Cancel my subscription  |
| POST   | `/credit-packs/:id/purchase` | Bearer token, active subscription | Start a pack purchase, returns Checkout options |
| POST   | `/credit-packs/verify` | Bearer token | Confirm a pack payment from Checkout |
| GET    | `/wallet`          | Bearer token  | Credit balance and active credit lots |
| GET    | `/wallet/transactions` | Bearer token | Credit history          |
| GET    | `/categories`      | none          | Category tree for menus       |
| GET    | `/categories/:slug` | none         | One category with breadcrumb and subcategories |
| GET    | `/banners`         | none          | Banners for the home screen   |
| POST   | `/generations/try-on` | Bearer token, 1 credit | Generate a virtual try-on image |
| GET    | `/generations`     | Bearer token  | My generation history         |
| GET    | `/generations/:id` | Bearer token  | One generation                |
| GET    | `/vendors/me`      | Bearer token  | My vendor status and eligibility |
| POST   | `/vendors/apply`   | Bearer token, active B2B subscription | Apply to become a vendor |
| GET    | `/products`        | none          | Store listing with filters    |
| GET    | `/products/:slug`  | none          | Store product page            |
| GET    | `/vendors/:vendorId/products` | none | One vendor's products, only while the vendor has an active B2B subscription |
| POST   | `/products`        | Bearer token  | Add a product (multipart with image files) |
| GET    | `/products/mine`   | Bearer token  | My products                   |
| GET    | `/products/mine/:id` | Bearer token | One of my products           |
| PATCH  | `/products/:id`    | Bearer token  | Edit my product, add or remove images |
| DELETE | `/products/:id`    | Bearer token  | Delete my product             |
| GET    | `/wishlist`        | Bearer token  | My saved products             |
| POST   | `/wishlist`        | Bearer token  | Save a product                |
| DELETE | `/wishlist/:productId` | Bearer token | Remove a saved product     |
| POST   | `/orders`          | Bearer token  | Place an order (buy or rent)  |
| POST   | `/orders/:id/verify` | Bearer token | Confirm an online payment    |
| GET    | `/orders`          | Bearer token  | My orders                     |
| GET    | `/orders/:id`      | Bearer token  | One of my orders              |
| POST   | `/orders/:id/cancel` | Bearer token | Cancel my order before it ships |
| GET    | `/orders/selling`  | Bearer token  | Orders I received as a seller |
| GET    | `/orders/selling/:id` | Bearer token | One order I received        |
| PATCH  | `/orders/selling/:id/status` | Bearer token | Move my order to the next step |
| POST   | `/orders/selling/:id/cancel` | Bearer token | Cancel an order I received |

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

## Buying a subscription (Razorpay autopay)

Subscriptions are paid through **Razorpay Checkout**. The first payment is charged immediately when the user approves the payment. Razorpay also sets up an autopay mandate using card, UPI AutoPay or eMandate, and charges every following month or year automatically. The app never sees card or bank details.

A user can have **one subscription at a time**.

### Flow

1. The user picks a plan. Call `POST /subscriptions` with `{ "planId": "<plan _id>" }`.
2. Open Razorpay Checkout with the `data.checkout` object from the response, unchanged.
3. When Checkout succeeds, its handler receives `razorpay_payment_id`, `razorpay_subscription_id` and `razorpay_signature`. Send all three to `POST /subscriptions/verify`.
4. The response contains the active subscription and the new credit balance. The first month's credits are already in the wallet.

If the user closes Checkout without paying, nothing is charged. They can start again with step 1.

### Web example

```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  async function subscribe(planId, token) {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const start = await fetch('/api/v1/subscriptions', {
      method: 'POST', headers, body: JSON.stringify({ planId }),
    }).then((r) => r.json());
    if (!start.success) return alert(start.message);

    const rzp = new Razorpay({
      ...start.data.checkout,
      handler: async (result) => {
        const done = await fetch('/api/v1/subscriptions/verify', {
          method: 'POST', headers, body: JSON.stringify(result),
        }).then((r) => r.json());
        // done.data.subscription.status === 'active', done.data.balance = new credit balance
      },
    });
    rzp.open();
  }
</script>
```

On mobile, pass the same `data.checkout` options to the Razorpay Android, iOS, React Native or Flutter SDK.

### Start a subscription

`POST /subscriptions` with `{ "planId": "6ac0e1a05079aaf00c50e701" }`. Response `201`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Subscription created. Complete payment in Razorpay Checkout",
  "data": {
    "subscription": {
      "_id": "6ac0f5005079aaf00c50eb00",
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
      "status": "created",
      "totalCount": 120,
      "paidCount": 0,
      "cancelAtPeriodEnd": false
    },
    "checkout": {
      "key": "rzp_test_xxxxxxxx",
      "subscription_id": "sub_PbQ9abc123",
      "name": "Feelvie",
      "description": "Pro Monthly",
      "prefill": { "contact": "+919876543210", "email": "test@feelvie.app", "name": "Test User" },
      "notes": { "userId": "...", "subscriptionId": "..." }
    }
  }
}
```

Calling this again before paying replaces the unpaid subscription. Calling it while a subscription is active returns **409**.

### Verify the first payment

`POST /subscriptions/verify` with the three values from the Checkout handler:

```json
{
  "razorpay_payment_id": "pay_PbQAxyz789",
  "razorpay_subscription_id": "sub_PbQ9abc123",
  "razorpay_signature": "9f2c...e1"
}
```

Response `200`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment verified",
  "data": {
    "subscription": {
      "_id": "6ac0f5005079aaf00c50eb00",
      "status": "active",
      "currentPeriodStart": "2026-10-03T10:00:00.000Z",
      "currentPeriodEnd": "2026-11-03T10:00:00.000Z",
      "paidCount": 1,
      "startedAt": "2026-10-03T10:00:00.000Z",
      "planSnapshot": { "name": "Pro Monthly", "creditsPerMonth": 100, "...": "..." }
    },
    "balance": 100
  }
}
```

It is safe to call verify more than once. Credits are never added twice. The server also learns about payments from Razorpay directly, so credits still arrive if the app is closed before verify is called.

### My subscription

`GET /subscriptions/me` returns:
- `current`: the subscription that is active or still being set up, or `null` if there is none.
- `history`: up to 20 subscriptions, newest first.

```json
{ "current": { "status": "active", "currentPeriodEnd": "2026-11-03T10:00:00.000Z", "cancelAtPeriodEnd": false, "...": "..." }, "history": [ ] }
```

How to show each `status`:

| `status`        | Meaning                                         | What to show                                  |
| --------------- | ----------------------------------------------- | --------------------------------------------- |
| `created`       | Checkout not completed                          | "Complete your payment" or let them pick a plan again |
| `authenticated` | Mandate approved, first charge processing       | "Activating..."                               |
| `active`        | Paid for the current period                     | Plan name and "Renews on `currentPeriodEnd`". If `cancelAtPeriodEnd` is true, show "Ends on `currentPeriodEnd`" instead |
| `pending`       | A renewal payment failed. Razorpay is retrying  | "Payment failed, update your payment method"  |
| `halted`        | All retries failed. No new credits are granted  | "Subscription paused due to failed payment"   |
| `cancelled`, `completed`, `expired` | Ended. Only appears in `history` | -                                    |

Support staff can also cancel a subscription. That can set `cancelAtPeriodEnd: true` or end it straight away, which makes `current` become `null`. Refetch `GET /subscriptions/me` when the app comes to the foreground rather than caching it. Ended subscriptions in `history` include `cancelledBy`, which is `user`, `admin` or `razorpay`.

### Cancel

`POST /subscriptions/cancel` with no body.
- **Active subscription:** it stays active until `currentPeriodEnd` and is not charged again. The response has `cancelAtPeriodEnd: true`. Credits already granted stay usable until they expire.
- **Unpaid or failing subscription:** it is cancelled immediately.

Calling cancel again on a subscription already set to end returns **400**. To switch plans, cancel first, then wait for the period to end before subscribing to the new plan.

### Credits from a subscription

- **Monthly plans:** `creditsPerMonth` is added on each successful charge and expires at the end of that billing month.
- **Yearly plans:** `creditsPerMonth` is added at the start of each of the 12 months, and each month's credits expire when that month ends. Credits do not roll over.

## Buying a credit pack

Only users with an **active** subscription can buy packs. A subscription that is cancelled but still inside its paid period counts as active. Packs use a one-time Razorpay order, not autopay.

### Flow

1. Call `POST /credit-packs/:id/purchase` with no body.
2. Open Razorpay Checkout with `data.checkout`.
3. Send the Checkout handler result (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) to `POST /credit-packs/verify`.

### Start a purchase

`POST /credit-packs/6ac0e2b15079aaf00c50e7a0/purchase`. Response `201`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Order created. Complete payment in Razorpay Checkout",
  "data": {
    "payment": {
      "_id": "6ac0f6005079aaf00c50ec00",
      "kind": "credit_pack",
      "status": "created",
      "amountInr": 199,
      "razorpayOrderId": "order_PbQBdef456",
      "packSnapshot": { "name": "Starter Pack", "credits": 50, "priceInr": 199, "validityDays": 90 }
    },
    "checkout": {
      "key": "rzp_test_xxxxxxxx",
      "order_id": "order_PbQBdef456",
      "amount": 19900,
      "currency": "INR",
      "name": "Feelvie",
      "description": "Starter Pack",
      "prefill": { "contact": "+919876543210" },
      "notes": { "paymentId": "6ac0f6005079aaf00c50ec00" }
    }
  }
}
```

`amount` is in paise, as Razorpay expects. Pass `checkout` to Razorpay unchanged.

### Verify a pack payment

`POST /credit-packs/verify`:

```json
{
  "razorpay_order_id": "order_PbQBdef456",
  "razorpay_payment_id": "pay_PbQCghi012",
  "razorpay_signature": "4be1...9a"
}
```

Response `200`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment verified, credits added",
  "data": {
    "payment": { "_id": "6ac0f6005079aaf00c50ec00", "status": "paid", "paidAt": "2026-10-03T10:05:00.000Z", "...": "..." },
    "creditsAdded": 50,
    "expiresOn": "2027-01-01T10:05:00.000Z",
    "balance": 150
  }
}
```

Pack credits keep working until `expiresOn`, even if the subscription ends earlier. Calling verify twice never adds credits twice.

### Payment errors

| Status | `message`                                                  | When                                      |
| ------ | ---------------------------------------------------------- | ----------------------------------------- |
| 400    | `Payment verification failed`                              | The signature does not match. Do not show success |
| 400    | `This subscription is already set to cancel...`            | Cancel called twice                       |
| 403    | `An active subscription is required to buy credit packs`   | Pack purchase without an active subscription |
| 404    | `Plan not found or no longer available`                    | The plan was deactivated                  |
| 404    | `Credit pack not found or no longer available`             |                                           |
| 404    | `Subscription not found` / `Order not found`               | The id is wrong or belongs to another user |
| 404    | `You do not have a subscription to cancel`                 |                                           |
| 409    | `You already have a subscription. Cancel it before choosing a new plan` | Subscribing while one is active |
| 502    | `Payment provider error: ...`                              | Razorpay rejected the request. Retry later |
| 503    | `Payments are not configured...`                           | Server setup problem. Report it           |

## Wallet and credits

Each user has a wallet. Credits arrive in **lots**. Each lot comes from a subscription month, a credit pack or an adjustment by support, and has its own expiry date. When credits are used, the lot that expires first is used first.

### Get wallet

`GET /wallet`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": {
    "balance": 130,
    "nextExpiry": { "credits": 80, "expiresOn": "2026-11-03T10:00:00.000Z" },
    "activeLots": [
      {
        "_id": "6ac0f0105079aaf00c50e900",
        "source": "subscription",
        "creditsAdded": 100,
        "creditsRemaining": 80,
        "expiresOn": "2026-11-03T10:00:00.000Z",
        "description": "Pro Monthly: credits for 03 Oct 2026 to 03 Nov 2026",
        "createdAt": "2026-10-03T10:00:00.000Z"
      },
      {
        "_id": "6ac0f0205079aaf00c50e901",
        "source": "credit_pack",
        "creditsAdded": 50,
        "creditsRemaining": 50,
        "expiresOn": "2027-01-01T10:00:00.000Z",
        "description": "Starter Pack",
        "createdAt": "2026-10-03T10:05:00.000Z"
      }
    ],
    "wallet": {
      "_id": "6ac0f0005079aaf00c50e8ff",
      "user": "6ac0c8425e44be9e0d7a5146",
      "balance": 130,
      "lifetimeCredited": 150,
      "lifetimeDebited": 20,
      "lifetimeExpired": 0
    }
  }
}
```

How to use this response:
- **Balance:** show `balance` as the user's credits.
- **Expiry warning:** use `nextExpiry` for a message like "80 credits expire on 3 Nov".
- **Breakdown:** `activeLots` lists every lot that still has credits, earliest expiry first.

### Credit history

`GET /wallet/transactions?type=credit&page=1&limit=20`. `type` is optional and can be `credit`, `debit`, `expire` or `refund`. Newest first.

```json
{
  "items": [
    {
      "_id": "6ac0f0305079aaf00c50e902",
      "type": "debit",
      "source": "usage",
      "creditsDeducted": 20,
      "balanceAfter": 130,
      "description": "...",
      "createdAt": "2026-10-04T08:00:00.000Z"
    },
    {
      "_id": "6ac0f0105079aaf00c50e900",
      "type": "credit",
      "source": "subscription",
      "creditsAdded": 100,
      "creditsRemaining": 80,
      "expiresOn": "2026-11-03T10:00:00.000Z",
      "balanceAfter": 100,
      "createdAt": "2026-10-03T10:00:00.000Z"
    }
  ],
  "total": 2,
  "page": 1,
  "pages": 1
}
```

| `type`   | Show as                                    | Amount field       |
| -------- | ------------------------------------------ | ------------------ |
| `credit` | "+100 credits", with `expiresOn`           | `creditsAdded`     |
| `debit`  | "-20 credits"                              | `creditsDeducted`  |
| `expire` | "20 credits expired"                       | `creditsDeducted`  |
| `refund` | "+1 credit refunded"                       | `creditsRefunded`  |

`source` explains where a transaction came from:
- `subscription` and `credit_pack`: purchases.
- `admin`: a support adjustment.
- `generation`: a try-on image. These transactions also carry `generation`, the generation id.
- `usage`, `expiry` and `refund`.

A failed generation shows as a `debit` followed by a `refund` with the same `generation`. The net cost is zero.

## Categories

Categories are a tree up to 3 levels deep, for example Women → Topwear → T-Shirts. No token is needed. Only active categories are returned. If a parent is hidden, everything under it is hidden too.

### Category tree

`GET /categories` returns the whole tree in one call. Use it for menus and filters. Siblings are already sorted in display order.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "_id": "6ac0ffe05079aaf00c50efe0",
      "title": "Women",
      "slug": "women",
      "description": "Clothing for women",
      "imageUrl": "https://api.feelvie.com/uploads/categories/1791023990000-a1b2c3d4e5f60718.webp",
      "parentId": null,
      "level": 1,
      "sortOrder": 1,
      "children": [
        {
          "_id": "6ac0fff05079aaf00c50eff0",
          "title": "Topwear",
          "slug": "topwear",
          "imageUrl": null,
          "parentId": "6ac0ffe05079aaf00c50efe0",
          "level": 2,
          "sortOrder": 0,
          "children": [
            {
              "_id": "6ac1001a5079aaf00c50f000",
              "title": "T-Shirts",
              "slug": "t-shirts",
              "imageUrl": "https://api.feelvie.com/uploads/categories/1791024000000-3f9c1a2b4d5e6f70.png",
              "parentId": "6ac0fff05079aaf00c50eff0",
              "level": 3,
              "sortOrder": 1,
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

- **Images:** `imageUrl` is a full URL, or `null` when the category has no image. Show a placeholder for `null`.
- **Descriptions:** `description` is left out when empty.

### One category

`GET /categories/:slug`, for example `GET /categories/t-shirts`. Use the slug in app routes and deep links. It stays the same when the title is renamed.

```json
{
  "category": { "_id": "6ac1001a5079aaf00c50f000", "title": "T-Shirts", "slug": "t-shirts", "imageUrl": "...", "parentId": "6ac0fff05079aaf00c50eff0", "level": 3, "sortOrder": 1 },
  "breadcrumb": [
    { "_id": "6ac0ffe05079aaf00c50efe0", "title": "Women", "slug": "women", "level": 1 },
    { "_id": "6ac0fff05079aaf00c50eff0", "title": "Topwear", "slug": "topwear", "level": 2 }
  ],
  "children": []
}
```

`breadcrumb` lists the parents, top level first. `children` lists the direct subcategories in display order. A hidden or unknown slug returns **404**.

## Banners

`GET /banners` returns the banners to show in the app, already in display order. No token is needed. Only active banners are returned, and the list is not paginated.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": [
    {
      "_id": "6ad2001a5079aaf00c510000",
      "title": "Festive sale",
      "imageUrl": "https://api.feelvie.com/uploads/banners/1791800000000-9a8b7c6d5e4f3021.webp",
      "slug": "dresses",
      "screenName": "CategoryProducts",
      "sortOrder": 0
    },
    {
      "_id": "6ad2002b5079aaf00c510001",
      "imageUrl": "https://api.feelvie.com/uploads/banners/1791800100000-1122334455667788.png",
      "slug": null,
      "screenName": "Plans",
      "sortOrder": 1
    }
  ]
}
```

- **On tap:** navigate to the screen named `screenName`. When `slug` is not `null`, pass it to that screen as a param, for example `navigation.navigate(banner.screenName, { slug: banner.slug })`.
- **Unknown screens:** `screenName` is typed by an admin and the server does not check it. Ignore the tap, or skip the banner, when the app has no screen with that name. An older app version can meet a screen name it does not have yet.
- **`slug`:** the server does not check that it belongs to a real category or product. Handle a 404 from the target screen.
- **`title`:** left out when empty. Use it as the image's accessibility label.
- **`imageUrl`:** always a full URL.

## Virtual try-on

The user uploads a photo of a person and a photo of a garment. The server returns an image of the person wearing the garment. Each generation costs **1 credit**.

### Generate

`POST /generations/try-on` with **`multipart/form-data`**, not JSON:

| Field          | Required | Rules                                |
| -------------- | -------- | ------------------------------------ |
| `personImage`  | Yes      | JPEG, PNG or WebP, up to 10 MB       |
| `garmentImage` | Yes      | JPEG, PNG or WebP, up to 10 MB       |

The request waits until the image is ready. This usually takes **15 to 30 seconds** and can take up to 2 minutes. Set the client timeout to at least 150 seconds and show a progress state.

```js
const form = new FormData();
form.append('personImage', personFile);   // File or Blob from an <input type="file"> or the camera
form.append('garmentImage', garmentFile);

const res = await fetch('/api/v1/generations/try-on', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` }, // do not set Content-Type; the browser adds the boundary
  body: form,
}).then((r) => r.json());
```

Response `201`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Image generated",
  "data": {
    "generation": {
      "_id": "6ac0fa105079aaf00c50ed00",
      "user": "6ac0c8425e44be9e0d7a5146",
      "type": "tryon",
      "status": "completed",
      "personImageUrl": "https://vton.feelvie.com/uploads/person/personImage-1779061251609.jpg",
      "garmentImageUrl": "https://vton.feelvie.com/uploads/garment/garmentImage-1779061251609.jpg",
      "outputImageUrl": "https://vton.feelvie.com/uploads/results/output-1779061267976.jpeg",
      "providerJobId": "6a0a52034ecbab7357f3b96c",
      "creditsCharged": 1,
      "creditsRefunded": 0,
      "debitTransaction": "6ac0fa105079aaf00c50ed01",
      "completedAt": "2026-10-03T10:30:16.000Z",
      "durationMs": 15102,
      "createdAt": "2026-10-03T10:30:01.000Z",
      "updatedAt": "2026-10-03T10:30:16.000Z"
    },
    "balance": 99
  }
}
```

Show `outputImageUrl`. `balance` is the user's credit balance after this generation.

### When generation fails

The credit is **refunded automatically**, and the failed attempt is saved in the history. The error includes the generation id:

```json
{
  "success": false,
  "statusCode": 502,
  "message": "Image generation failed. Your credit has been refunded",
  "details": { "generationId": "6ac0fa205079aaf00c50ed10", "creditsRefunded": 1 }
}
```

| Status | `message`                                                   | What to do                                  |
| ------ | ----------------------------------------------------------- | ------------------------------------------- |
| 400    | `Validation failed` (`details`: which file is missing)       | Ask for both photos                         |
| 400    | `personImage must be a JPEG, PNG or WebP image`             | Wrong file type                             |
| 400    | `Each image must be 10 MB or smaller`                       | Compress or resize before uploading         |
| 400    | `Unexpected file field "...", or too many files in it` / `Too many files uploaded` | Send only `personImage` and `garmentImage`  |
| 402    | `Not enough credits...` (`details`: `balance`, `required`)  | Show the plans or credit packs              |
| 429    | `You can run 2 generations at a time...`                    | Wait for a running one to finish            |
| 429    | `Too many generation requests...`                           | More than 30 in 15 minutes                  |
| 502    | `Image generation failed. Your credit has been refunded`    | Let the user try again, perhaps with clearer photos |
| 502    | `Image generation service is unreachable. Your credit has been refunded` | Retry later                     |
| 503    | `Image generation is not configured...`                     | Server setup problem. Nothing was charged   |
| 504    | `Image generation timed out. Your credit has been refunded` | Retry later                                 |

If the app loses the connection while waiting, check `GET /generations` afterwards. Every attempt is recorded there. If the server restarts mid-generation, the attempt is marked failed and refunded within about 10 minutes.

### History

`GET /generations?status=completed&page=1&limit=20`. `status` is optional and can be `processing`, `completed` or `failed`. Newest first. Each item has the same shape as `generation` above.

```json
{ "items": [ /* generations */ ], "total": 12, "page": 1, "pages": 1 }
```

`GET /generations/:id` returns one generation. Another user's id returns **404**.

| `status`     | Meaning                                                  |
| ------------ | -------------------------------------------------------- |
| `processing` | Running now                                              |
| `completed`  | `outputImageUrl` is ready                                |
| `failed`     | `error` says why. `creditsRefunded` is 1                 |

## Products

A user lists a dress either **for sale** or **for rent**. Any logged-in user can add products. Shoppers only see them in the store once the owner is an approved vendor. See "Becoming a vendor".

### Product fields

| Field         | Required | Rules                                                              |
| ------------- | -------- | ------------------------------------------------------------------ |
| `title`       | Yes      | 3 to 150 characters                                                |
| `description` | No       | Up to 2000 characters                                              |
| `category`    | Yes      | The `_id` of an active category                                    |
| `listingType` | Yes      | `"sale"` or `"rent"`. Cannot be changed later                      |
| `sale`        | For sale | `{ "originalPriceInr": 5000, "priceInr": 3000 }`. `priceInr` cannot be higher than `originalPriceInr` |
| `rent`        | For rent | `{ "pricePerDayInr": 800, "securityDepositInr": 2000, "minDays": 2, "maxDays": 7 }`. Deposit defaults to 0, `minDays` to 1 and `maxDays` to 30 |
| `sizes`       | Yes      | A list such as `[{ "size": "S", "stock": 2 }, { "size": "M", "stock": 0 }]`. At least 1, at most 20, no repeated size. Stock is a whole number, 0 or more |
| `images`      | Yes      | 1 to 6 image **files** picked by the user. JPEG, PNG or WebP, up to 10 MB each. URLs are not accepted |
| `brand`       | No       | Up to 100 characters                                               |
| `color`       | No       | Up to 50 characters                                                |
| `condition`   | No       | `"new"`, `"like_new"`, `"good"` or `"fair"`                        |
| `isActive`    | No       | `false` hides the product from the store. Default `true`           |

The server also returns:

| Field          | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `slug`         | Built from the title, such as `red-silk-gown`. Used in store URLs. It does not change when the title changes |
| `imageUrls`    | Full URLs of the uploaded images, in order. The first is the cover |
| `images`       | The stored paths of the same images. Owner responses only. Use these or the URLs in `removeImages` |
| `listPriceInr` | `sale.priceInr` or `rent.pricePerDayInr`. Handy for cards and sorting |
| `totalStock`, `inStock` | The sum of all size stock, and whether it is above 0     |
| `isBlocked`, `blockedReason` | Owner responses only. Set when the Feelvie team hides the product |

### Add a product

`POST /products` with the token, as **`multipart/form-data`**. Do not send JSON, because the images are files.

- Add each image file under the field name `images`. Repeat the field for several files.
- Send `sale`, `rent` and `sizes` as JSON text.

```js
const form = new FormData();
form.append('title', 'Red Silk Gown');
form.append('category', categoryId);
form.append('listingType', 'sale');
form.append('sale', JSON.stringify({ originalPriceInr: 5000, priceInr: 3000 }));
form.append('sizes', JSON.stringify([{ size: 'S', stock: 2 }, { size: 'M', stock: 1 }]));
form.append('condition', 'like_new');
for (const file of pickedFiles) form.append('images', file);

await fetch(`${BASE_URL}/products`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` }, // do not set Content-Type yourself
  body: form,
});
```

In React Native, append each image as `{ uri, name, type }`.

Success is **201**:

```json
{
  "_id": "6ac1b0105079aaf00c510001",
  "owner": "6ac0c8425e44be9e0d7a5146",
  "title": "Red Silk Gown",
  "slug": "red-silk-gown",
  "category": "6ac1000a5079aaf00c50f000",
  "listingType": "sale",
  "sale": { "originalPriceInr": 5000, "priceInr": 3000 },
  "listPriceInr": 3000,
  "sizes": [{ "size": "S", "stock": 2 }, { "size": "M", "stock": 1 }],
  "totalStock": 3,
  "inStock": true,
  "images": ["/uploads/products/1791030000000-3f9c1a2b4d5e6f70.jpg"],
  "imageUrls": ["https://api.feelvie.com/uploads/products/1791030000000-3f9c1a2b4d5e6f70.jpg"],
  "condition": "like_new",
  "isActive": true,
  "isBlocked": false,
  "createdAt": "2026-10-03T13:00:00.000Z"
}
```

A user can have at most 200 products.

### My products

- `GET /products/mine?listingType=sale&isActive=true&page=1&limit=20` lists the logged-in user's products, newest first. Both filters are optional. Each item's `category` is `{ _id, title, slug }`.
- `GET /products/mine/:id` returns one of them. Another user's product returns **404**.

These include hidden and blocked products. Show `blockedReason` when `isBlocked` is `true`.

### Edit a product

`PATCH /products/:id` with only the fields to change. Use `multipart/form-data` when adding images, or JSON otherwise.

- **Prices:** send only the price that changes, such as `{ "sale": { "priceInr": 2500 } }`. The other prices are kept.
- **Sizes:** send the full new list. It replaces the old one. This is also how stock is updated.
- **Add images:** attach new files under `images`. They are added after the existing ones.
- **Remove images:** send `removeImages` with the paths or URLs to delete, such as `["https://api.feelvie.com/uploads/products/x.jpg"]`. In a multipart form, send it as JSON text.
- A product must end up with 1 to 6 images.
- `listingType` cannot be changed. Add a new product instead.
- Send `""` to clear `description`, `brand`, `color` or `condition`.

### Delete a product

`DELETE /products/:id` removes the product and its images for good.

### Store listing

`GET /products` is public. It returns products from approved vendors only. This is the main listing for shoppers.

The token is optional. When you send a valid user token, every item also has `isWishlisted` (`true` or `false`) for that user. Without a token, or with an expired one, the field is left out and the request still succeeds.

| Query         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `category`    | A category **slug**. Includes every subcategory under it            |
| `listingType` | `sale` or `rent`                                                    |
| `size`        | Only products with this size in stock, such as `M`                  |
| `minPrice`, `maxPrice` | Range on `listPriceInr`: the sale price, or the rent price per day |
| `inStock`     | `true` shows only products with stock                               |
| `search`      | Matches the title or brand                                          |
| `vendor`      | A user id. Shows only that vendor's products, for a vendor store page |
| `sort`        | `newest` (default), `price_asc` or `price_desc`                     |
| `page`, `limit` | Default 1 and 20. `limit` is capped at 100                        |

```json
{
  "items": [
    {
      "_id": "6ac1b0105079aaf00c510001",
      "owner": "6ac0c8425e44be9e0d7a5146",
      "title": "Red Silk Gown",
      "slug": "red-silk-gown",
      "category": { "_id": "6ac1000a5079aaf00c50f000", "title": "Dresses", "slug": "dresses" },
      "listingType": "sale",
      "sale": { "originalPriceInr": 5000, "priceInr": 3000 },
      "listPriceInr": 3000,
      "sizes": [{ "size": "S", "stock": 2 }, { "size": "M", "stock": 1 }],
      "totalStock": 3,
      "inStock": true,
      "imageUrls": ["https://api.feelvie.com/uploads/products/1791030000000-3f9c1a2b4d5e6f70.jpg"],
      "condition": "like_new"
    }
  ],
  "total": 1,
  "page": 1,
  "pages": 1
}
```

Out-of-stock products are still listed, with `inStock: false`. Show them as sold out, or pass `inStock=true` to leave them out.

### One vendor's products

`GET /vendors/:vendorId/products` is public. `vendorId` is the vendor's user id, which is the `owner` field on any product. Use it for a vendor's store page.

It returns that vendor's store products **only while the vendor has an active B2B subscription**. If the subscription is missing, unpaid, halted or cancelled, the list is empty.

- It takes the same filters, sorting and paging as the store listing, except `vendor`: `category`, `listingType`, `size`, `minPrice`, `maxPrice`, `inStock`, `search`, `sort`, `page` and `limit`.
- Items have the same shape as store listing items, including `isWishlisted` when a user token is sent.
- `data` has one extra field, `vendorHasActiveSubscription`.

```json
{
  "items": [ /* products */ ],
  "total": 2,
  "page": 1,
  "pages": 1,
  "vendorHasActiveSubscription": true
}
```

When the list is empty, check `vendorHasActiveSubscription`. If it is `false`, show "This store is currently unavailable" rather than "No products". A vendor who is not approved, or an unknown id, also returns an empty list. An id that is not a valid id returns **400**.

The main store listing, `GET /products`, does not apply this subscription rule. It shows products from every approved vendor.

### Store product page

`GET /products/:slug` is public, and also adds `isWishlisted` to `product` when a user token is sent. `data` is `{ "product": { ... }, "breadcrumb": [ ... ] }`. `product` has the same shape as a listing item. `breadcrumb` lists the category path, top level first, each as `{ _id, title, slug, level }`.

A product is hidden from both store endpoints, and returns **404** by slug, when any of these is true:

- The owner is not an approved vendor, or has been suspended.
- The owner set `isActive` to `false`.
- The Feelvie team blocked it.
- Its category, or a parent of its category, is deactivated.

### Product errors

| Status | `message`                                                  | When                                        |
| ------ | ---------------------------------------------------------- | ------------------------------------------- |
| 400    | `Validation failed`                                        | A field is missing or invalid. `details` lists each problem, such as `sizes[0].stock must be a whole number, 0 or more` |
| 400    | `Upload at least one image in the "images" field`          | Adding a product with no image file         |
| 400    | `images must be JPEG, PNG or WebP images`                  | Wrong file type                             |
| 400    | `Each image must be 10 MB or smaller`                      |                                             |
| 400    | `Unexpected file field "...", or too many files in it`     | More than 6 files, or a file under a field other than `images` |
| 400    | `A product must keep at least one image`                   | Removing every image                        |
| 400    | `A product can have at most 6 images`                      | Existing plus new images exceed 6           |
| 400    | `removeImages contains an image that is not on this product` |                                           |
| 400    | `category must be an active category`                      | Unknown or deactivated category             |
| 400    | `listingType cannot be changed. Add a new product instead` |                                             |
| 400    | `This product is listed for sale. It cannot have rent prices` | Sending the other type's prices on edit  |
| 400    | `You can add at most 200 products`                         |                                             |
| 404    | `Product not found`                                        | Unknown id or slug, another user's product, or a product hidden from the store |
| 404    | `Category not found`                                       | Unknown `category` slug in the store listing |

## Wishlist

A logged-in user can save products to a wishlist. All wishlist endpoints need the token.

### Save a product

`POST /wishlist` with `{ "productId": "6ac1b0105079aaf00c510001" }`.

- **201** when the product is newly saved, **200** when it was already saved. Both return `{ "productId": "...", "isWishlisted": true }`, so a heart button can call this without checking first.
- Only products visible in the store can be saved. A user cannot save their own product.
- A wishlist holds at most 200 products.

### Remove a product

`DELETE /wishlist/:productId` returns `{ "productId": "...", "isWishlisted": false }`. Removing a product that is not saved is not an error.

### My wishlist

`GET /wishlist?page=1&limit=20` lists saved products, newest saved first. `data` is `{ items, total, page, pages }`. Each item has the same shape as a store listing item, plus `isWishlisted: true` and `savedAt`.

A saved product that is later hidden, blocked or out of an active category is left out of the list. It comes back by itself if it becomes visible again. A deleted product is removed for good.

### Wishlist errors

| Status | `message`                                          | When                                   |
| ------ | -------------------------------------------------- | -------------------------------------- |
| 400    | `Validation failed`                                | `productId` is missing or not a valid id |
| 400    | `You cannot add your own product to your wishlist` |                                        |
| 400    | `Your wishlist can hold at most 200 products`      |                                        |
| 404    | `Product not found`                                | Unknown product, or one not visible in the store |

## Orders

A shopper buys or rents one product per order: one size, a quantity, and one of their saved addresses. There is no cart. All order endpoints need the token.

| Payment method | Works for      | How it goes                                                    |
| -------------- | -------------- | -------------------------------------------------------------- |
| `online`       | Sale and rent  | Pay through Razorpay Checkout. The order is confirmed after payment |
| `cod`          | Sale only      | Cash on delivery. The order is placed straight away            |

### Order status

```
online:  pending_payment -> placed -> confirmed -> shipped -> delivered -> returned (rentals only)
cod:                        placed -> confirmed -> shipped -> delivered
cancelled can happen at any point before delivered
```

| `status`          | Meaning                                                       |
| ----------------- | ------------------------------------------------------------- |
| `pending_payment` | Online order waiting for payment. It is cancelled automatically if unpaid after 30 minutes (`expiresAt`) |
| `placed`          | Confirmed with the seller. Waiting for the seller to accept   |
| `confirmed`       | The seller accepted it                                        |
| `shipped`         | On its way                                                    |
| `delivered`       | Received. A COD order is marked paid at this point            |
| `returned`        | Rentals only. The piece came back to the seller               |
| `cancelled`       | See `cancelledBy` (`buyer`, `seller`, `admin` or `system`) and `cancelReason` |

`paymentStatus` is `pending`, `paid` or `failed`. `statusHistory` lists every change with who made it and when.

### Place an order

`POST /orders` with a JSON body:

| Field           | Required   | Rules                                                        |
| --------------- | ---------- | ------------------------------------------------------------ |
| `productId`     | Yes        | A product visible in the store. Not the user's own product   |
| `size`          | Yes        | One of the product's sizes, such as `"M"`                    |
| `quantity`      | No         | 1 to 10. Default 1. Limited by the stock of that size        |
| `addressId`     | Yes        | One of the user's saved addresses                            |
| `paymentMethod` | Yes        | `"online"` or `"cod"`. Rentals must use `"online"`           |
| `startDate`     | For rent   | The first rental day as `"YYYY-MM-DD"`. Today or later, at most 90 days ahead |
| `days`          | For rent   | Number of rental days, within the product's `minDays` and `maxDays` |

The price is always taken from the product on the server. Totals:

- **Sale:** `priceInr` × quantity.
- **Rent:** `pricePerDayInr` × days × quantity, plus `securityDepositInr` × quantity. The deposit is refunded after the piece is returned.

Success is **201**. For COD, `data` is `{ "order": { ... } }` with status `placed`. For online, `data` also has `checkout`:

```json
{
  "order": {
    "_id": "6ac1c0105079aaf00c520001",
    "orderNumber": "FV-20261003-7K2M9Q",
    "buyer": "6ac0c8425e44be9e0d7a5146",
    "seller": "6ac0c8425e44be9e0d7a5999",
    "product": "6ac1b0105079aaf00c510001",
    "productSnapshot": { "title": "Blue Lehenga", "slug": "blue-lehenga", "image": "/uploads/products/1791030000000-3f9c.jpg" },
    "type": "rent",
    "size": "L",
    "quantity": 1,
    "pricing": { "pricePerDayInr": 800, "days": 3, "rentTotalInr": 2400, "securityDepositInr": 2000, "totalInr": 4400 },
    "rental": { "startDate": "2026-10-06T00:00:00.000Z", "endDate": "2026-10-09T00:00:00.000Z", "days": 3 },
    "shippingAddress": { "fullName": "Rahul Sharma", "phone": "+919876543210", "addressLine1": "Flat 302", "city": "Pune", "state": "Maharashtra", "pincode": "411001", "country": "India" },
    "paymentMethod": "online",
    "paymentStatus": "pending",
    "razorpayOrderId": "order_PQr5tUvWxYz012",
    "expiresAt": "2026-10-03T13:30:00.000Z",
    "status": "pending_payment",
    "statusHistory": [{ "status": "pending_payment", "by": "buyer", "at": "2026-10-03T13:00:00.000Z" }],
    "refund": { "amountInr": 0, "status": "none" }
  },
  "checkout": {
    "key": "rzp_test_xxxxxxxx",
    "order_id": "order_PQr5tUvWxYz012",
    "amount": 440000,
    "currency": "INR",
    "name": "Feelvie",
    "description": "Blue Lehenga",
    "prefill": { "contact": "+919876543210" },
    "notes": { "orderId": "6ac1c0105079aaf00c520001", "orderNumber": "FV-20261003-7K2M9Q" }
  }
}
```

A sale order has `pricing` as `{ "unitPriceInr": 3000, "itemsTotalInr": 6000, "totalInr": 6000 }` and no `rental`.

The stock is held as soon as the order is created, including while an online order waits for payment. Build the image URL for `productSnapshot.image` by adding it to the API origin, such as `https://api.feelvie.com` + the path.

### Pay online

1. Open Razorpay Checkout with the `checkout` object as its options, the same way as for credit packs.
2. On success, send the three values Razorpay returns to `POST /orders/:id/verify`:

```json
{
  "razorpay_order_id": "order_PQr5tUvWxYz012",
  "razorpay_payment_id": "pay_PQs8aBcDeFgH34",
  "razorpay_signature": "9f2c..."
}
```

Success returns the order with status `placed` and `paymentStatus` `paid`. Calling verify twice is safe.

- If the app closes before verify, the server still confirms the order from Razorpay's webhook. On next launch, read the order with `GET /orders/:id`.
- If the user closes Checkout or the payment fails, the order stays `pending_payment`. Reopen Checkout with the same `razorpayOrderId` to retry until `expiresAt`. After that the order is cancelled and the stock is released, so place a new order.
- If a payment lands after the order was cancelled, the order stays cancelled and `refund.status` becomes `pending`.

### My orders

- `GET /orders?status=shipped&type=rent&page=1&limit=20` lists the user's orders, newest first. Both filters are optional.
- `GET /orders/:id` returns one order. Here `seller` is `{ _id, name }`.

### Cancel an order

`POST /orders/:id/cancel` with an optional `{ "reason": "..." }`. The buyer can cancel while the status is `pending_payment`, `placed` or `confirmed`. Once it is shipped, only the seller or support can cancel.

### Refunds

`refund` on an order is `{ amountInr, status, reason }`, where `status` is `none`, `pending` or `done`.

- A paid order that is cancelled gets a `pending` refund of the full amount.
- A rental that is returned gets a `pending` refund of the security deposit.
- The Feelvie team pays refunds out manually, and the status then becomes `done`. Show "Refund in progress" for `pending` and "Refunded" for `done`.

### Orders I received (sellers)

A user who sells sees the orders for their products here. Orders still waiting for payment are not shown.

- `GET /orders/selling?status=placed&type=sale&page=1&limit=20` lists them, newest first. Each item's `buyer` is `{ _id, name, phone }`.
- `GET /orders/selling/:id` returns one, with the buyer's contact and `shippingAddress`.
- `PATCH /orders/selling/:id/status` with `{ "status": "confirmed" }` moves the order to its next step. Steps must go in order: `confirmed`, then `shipped`, then `delivered`, then `returned` for rentals. Skipping a step returns 400.
- `POST /orders/selling/:id/cancel` with a required `{ "reason": "..." }` cancels any order that is not yet delivered.

Marking a rental `returned` puts the piece back in stock and starts the deposit refund.

### Order errors

| Status | `message`                                                        | When                                      |
| ------ | ---------------------------------------------------------------- | ----------------------------------------- |
| 400    | `Validation failed`                                              | A field is missing or invalid. See `details` |
| 400    | `You cannot order your own product`                              |                                           |
| 400    | `This product is not available in size XL`                       | The product has no such size              |
| 400    | `addressId must be one of your saved addresses`                  |                                           |
| 400    | `Rentals must be paid online. Cash on delivery is only for purchases` | `cod` on a rental                    |
| 400    | `This product can be rented for 2 to 7 days`                     | `days` outside the product's limits       |
| 400    | `startDate is required for a rental, as YYYY-MM-DD` / `startDate cannot be in the past` / `startDate can be at most 90 days from today` | |
| 400    | `Payment verification failed`                                    | Wrong signature or Razorpay order id      |
| 400    | `This order is shipped and can no longer be cancelled`           | Buyer cancel after shipping               |
| 400    | `This order is already cancelled`                                |                                           |
| 400    | `This order is placed. The next step is confirmed`               | Seller skipped a step                     |
| 400    | `This order is delivered and has no further steps`               |                                           |
| 404    | `Product not found`                                              | Unknown product, or one not visible in the store |
| 404    | `Order not found`                                                | Unknown id, or an order that is not yours |
| 409    | `Size M is out of stock` / `Only 2 left in size M`               | Not enough stock. Someone may have just bought the last piece |
| 409    | `This order was just updated by someone else. Please refresh and try again` | Two changes at the same moment |
| 502    | `Payment provider error: ...`                                    | Razorpay could not create the payment. No order is created and the stock is not held |

## Becoming a vendor

A user can sell their own dresses once they are an approved vendor. They apply in the app, and the Feelvie team reviews the application. Their products appear in stores only after approval.

Conditions to apply:

1. An **active B2B subscription**. A B2C plan, or a B2B plan that is unpaid, halted or cancelled, does not count.
2. At least **5 products added**. See "Products". Products blocked by the Feelvie team do not count. Hidden (`isActive: false`) and out-of-stock products do count.

### Vendor status

`GET /vendors/me` needs the token. Call it to decide which screen to show.

```json
{
  "status": "pending",
  "vendor": {
    "_id": "6ac1a0105079aaf00c50f001",
    "user": "6ac0c8425e44be9e0d7a5146",
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
  "canApply": false,
  "canSell": false
}
```

| `status`      | Meaning                                  | What to show                                         |
| ------------- | ---------------------------------------- | ---------------------------------------------------- |
| `not_applied` | No application yet. `vendor` is `null`   | The apply button if `canApply`, otherwise `eligibility.unmet` |
| `pending`     | Waiting for review                       | "Under review"                                       |
| `approved`    | Approved by the team                     | The seller area                                      |
| `rejected`    | Rejected. `vendor.statusReason` says why | The reason and an "Apply again" button if `canApply` |
| `suspended`   | Blocked by the team. `vendor.statusReason` says why | The reason and a contact-support message  |

- `canApply` is `true` only when the conditions are met and the status is `not_applied` or `rejected`.
- `canSell` is `true` when the status is `approved`.
- `eligibility.unmet` is a list of messages you can show as they are, such as `"An active B2B subscription is required"` or `"Add at least 5 products before applying. You have 3"`.
- `eligibility.products.count` is how many of the user's products count towards the 5. Use it for a progress hint such as "3 of 5 products added".

### Apply

`POST /vendors/apply` with the token. No body is needed.

Success is **201** with the vendor object in `data` and status `pending`. After a rejection, call the same endpoint to apply again.

### Vendor errors

| Status | `message`                                                  | When                                        |
| ------ | ---------------------------------------------------------- | ------------------------------------------- |
| 403    | `An active B2B subscription is required`                   | Applying without meeting the conditions. `details` lists every unmet condition |
| 403    | `Add at least 5 products before applying. You have 3`      | Applying with fewer than 5 products         |
| 403    | `Your vendor account is suspended. Please contact support` | Applying while suspended                    |
| 409    | `Your vendor application is already under review`          | Applying while pending                      |
| 409    | `You are already an approved vendor`                       | Applying when approved                      |

## Status codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| 200  | Success                                         |
| 201  | Created                                         |
| 400  | Bad input, wrong or expired OTP, or failed payment verification |
| 401  | Not logged in, or token invalid or expired      |
| 403  | Logged in but not allowed, such as buying a pack without a subscription or applying as a vendor without a B2B subscription |
| 402  | Not enough credits for a generation             |
| 404  | Not found                                       |
| 409  | Conflict, such as an email already in use or an existing subscription |
| 429  | Rate limited, too many OTP attempts, or too many generations at once |
| 500  | Server error                                    |
| 502  | Payment provider (Razorpay) or image generation error |
| 503  | Payments or image generation not configured on the server |
| 504  | Image generation timed out                      |

## Rate limits

| Endpoints              | Limit                      |
| ---------------------- | -------------------------- |
| `get-otp`, `verify-otp` | 20 requests every 15 minutes per IP |
| `generations/try-on`   | 30 requests every 15 minutes per user, and 2 running at a time |
| Everything else        | 100 requests every 15 minutes per IP |

When limited you get **429**. Disable the Resend OTP button for a while instead of retrying in a loop.

## Changelog for frontend

| Date       | Change                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| 2026-10-12 | Banners added: `GET /banners` returns the active banners with `imageUrl`, `screenName` and `slug`. It is public. |
| 2026-10-03 | Added `GET /vendors/:vendorId/products`: one vendor's store products, returned only while that vendor has an active B2B subscription. The response has a new field `vendorHasActiveSubscription`. |
| 2026-10-03 | Orders added for buying and renting: place an order, pay online or by cash on delivery, verify payment, list, view and cancel. Sellers get `/orders/selling` to view and move their orders. Stock now goes down when an order is placed. |
| 2026-10-03 | Wishlist added: `GET /wishlist`, `POST /wishlist` and `DELETE /wishlist/:productId`. `GET /products` and `GET /products/:slug` now accept an optional token and then return `isWishlisted`. `GET /products` has a new `vendor` filter. |
| 2026-10-03 | The 5-product rule for vendor applications is now enforced. `POST /vendors/apply` returns 403 with fewer than 5 products, and `eligibility.products` now has `enforced: true` and a real `count`. |
| 2026-10-03 | Products added. Owners: `POST /products` (multipart with uploaded image files), `GET /products/mine`, `GET /products/mine/:id`, `PATCH /products/:id` and `DELETE /products/:id`. Store: `GET /products` with filters and `GET /products/:slug`. The unexpected-file upload error message changed. |
| 2026-10-03 | Vendor applications simplified: `POST /vendors/apply` takes no body, `PATCH /vendors/me` is removed, and the vendor object has no store or contact fields. `canSell` is now true whenever the status is `approved`. |
| 2026-10-03 | Vendor applications added: `GET /vendors/me` and `POST /vendors/apply`. Applying needs an active B2B subscription. The 5-product rule is not enforced yet. |
| 2026-10-03 | Categories added: `GET /categories` (tree) and `GET /categories/:slug` (detail with breadcrumb). Both are public. |
| 2026-10-03 | Virtual try-on added: `POST /generations/try-on` (1 credit, automatic refund on failure), `GET /generations` and `GET /generations/:id`. New transaction type `refund` and source `generation`. New status codes 402 and 504. |
| 2026-10-03 | Subscriptions can now be cancelled by support, and ended subscriptions show `cancelledBy`. The cancel-twice error message now starts with "This subscription". |
| 2026-10-03 | Subscriptions with Razorpay autopay, and credit pack purchases, added. Packs need an active subscription. See "Buying a subscription" and "Buying a credit pack". |
| 2026-10-03 | Added `GET /wallet` and `GET /wallet/transactions`. |
| 2026-10-03 | Added `GET /plans` and `GET /credit-packs` for the pricing page. |
| 2026-10-03 | The `role` field was removed from the user object. `GET /users` and `DELETE /users/:id` moved to the admin API. `/users/:id` now only works with your own id. |
| 2026-10-03 | Addresses added: users can save up to 10 addresses with one default. See the Addresses section. |
| 2026-10-03 | Phone + OTP login added. Email and password login removed. Token lifetime is now 120 days. |
