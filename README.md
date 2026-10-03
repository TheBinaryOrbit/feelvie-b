# Feelvie Backend

REST API for Feelvie, built with Node.js, Express and MongoDB (Mongoose).

## Documentation

- [Architecture](docs/ARCHITECTURE.md): layers, models, auth, billing flows, config
- [Frontend guide](docs/FRONTEND_GUIDE.md): every endpoint the app calls, with examples
- [Admin guide](docs/ADMIN_GUIDE.md): every admin endpoint, with examples
- [Changelog](CHANGELOG.md)

## Getting started

```bash
npm install
cp .env.example .env   # then edit values
npm run dev            # starts with nodemon on http://localhost:5000
npm run create-admin -- --email admin@feelvie.app --password "a-strong-password" --name "Admin"
```

## Scripts

| Script                 | Description                           |
| ---------------------- | ------------------------------------- |
| `npm start`            | Run the server with Node              |
| `npm run dev`          | Run with nodemon (auto-reload)        |
| `npm run lint`         | Lint `src` and `scripts` with ESLint  |
| `npm run create-admin` | Create an admin account               |

## Project structure

```
src/
├── config/        # env loading and MongoDB connection
├── controllers/   # HTTP layer: read req, call service, send response
├── models/        # Mongoose schemas
├── routes/        # Express routers, mounted under /api/v1 (admin routes under /api/v1/admin)
├── services/      # business logic and DB access
├── middleware/    # auth, validation, rate limiting, error handling
├── utils/         # ApiError, ApiResponse, asyncHandler, jwt, pagination, logger
├── app.js         # Express app setup
└── server.js      # entry point: connects DB and starts server
scripts/           # CLI scripts such as create-admin
```

Request flow: `route -> middleware -> controller -> service -> model`.

## API overview

All routes are prefixed with `/api/v1`. See the guides for full details.

- **App API:** phone + OTP login, profile, addresses, categories, plans, subscriptions, credit packs, wallet, virtual try-on generation and vendor applications. Uses the user token.
- **Admin API:** under `/api/v1/admin`. Email + password login, users, categories (with image upload), plans, credit packs, subscriptions (including cancel), wallet adjustments, generations and vendor approvals. Uses the admin token.
- **Uploaded files:** served at `/uploads/...` from `UPLOADS_DIR`. Set `PUBLIC_BASE_URL` to the API's public address so image URLs are correct.
- **Webhook:** `POST /api/v1/webhooks/razorpay`, called by Razorpay only.

OTPs are mocked while `OTP_MOCK=true`, and the code is always `123456`.

Try-on generation needs `VTON_API_KEY`. Payments need `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Until they are set, payment endpoints return 503. The setup steps are in the admin guide.

## Adding a new feature

1. Create `src/models/<name>.model.js`
2. Create `src/services/<name>.service.js`
3. Create `src/controllers/<name>.controller.js`
4. Create `src/routes/<name>.routes.js` and mount it in `src/routes/index.js`. Admin routes go in `src/routes/admin/`.
5. Update the docs, as described in `CLAUDE.md`.
