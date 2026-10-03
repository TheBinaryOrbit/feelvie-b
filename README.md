# Feelvie Backend

REST API for Feelvie, built with Node.js, Express and MongoDB (Mongoose).

## Documentation

- [Architecture](docs/ARCHITECTURE.md): layers, models, auth flow, config
- [Frontend guide](docs/FRONTEND_GUIDE.md): how the app calls the API
- [Changelog](CHANGELOG.md)

## Getting started

```bash
npm install
cp .env.example .env   # then edit values
npm run dev            # starts with nodemon on http://localhost:5000
```

## Scripts

| Script        | Description                      |
| ------------- | -------------------------------- |
| `npm start`   | Run the server with Node         |
| `npm run dev` | Run with nodemon (auto-reload)   |
| `npm run lint`| Lint the `src` folder with ESLint |

## Project structure

```
src/
├── config/        # env loading and MongoDB connection
├── controllers/   # HTTP layer: read req, call service, send response
├── models/        # Mongoose schemas
├── routes/        # Express routers, mounted under /api/v1
├── services/      # business logic and DB access
├── middleware/    # auth, validation, rate limiting, error handling
├── utils/         # ApiError, ApiResponse, asyncHandler, jwt, logger
├── app.js         # Express app setup
└── server.js      # entry point: connects DB and starts server
```

Request flow: `route -> middleware -> controller -> service -> model`.

## API endpoints

All routes are prefixed with `/api/v1`.

| Method | Path             | Auth           | Description          |
| ------ | ---------------- | -------------- | -------------------- |
| GET    | `/health`        | none           | Health check         |
| POST   | `/auth/get-otp`    | none           | Send OTP to a phone  |
| POST   | `/auth/verify-otp` | none           | Verify OTP, returns user + JWT (120 days) |
| GET    | `/auth/me`       | Bearer token   | Current user         |
| GET    | `/users`         | admin          | List users (paged)   |
| GET    | `/users/:id`     | self or admin  | Get a user           |
| PATCH  | `/users/:id`     | self or admin  | Update a user        |
| DELETE | `/users/:id`     | admin          | Delete a user        |
| GET    | `/addresses`     | Bearer token   | List my addresses    |
| POST   | `/addresses`     | Bearer token   | Add an address (max 10) |
| GET    | `/addresses/:id` | Bearer token   | Get one address      |
| PATCH  | `/addresses/:id` | Bearer token   | Update an address    |
| PATCH  | `/addresses/:id/default` | Bearer token | Set default address |
| DELETE | `/addresses/:id` | Bearer token   | Delete an address    |

## Phone + OTP auth

1. `POST /api/v1/auth/get-otp` with `{ "phone": "+919876543210" }`
2. `POST /api/v1/auth/verify-otp` with `{ "phone": "+919876543210", "otp": "123456" }`
   - 200: `{ user, token }`, token valid for 120 days
   - 404: `OTP matched, account not found`
   - 400: wrong, expired or missing OTP. 429 after 5 wrong attempts.

OTPs expire after 5 minutes and are single-use. While `OTP_MOCK=true` the code is always `123456`.
To go live, set `OTP_MOCK=false` and implement `deliverCode` in `src/services/otp.service.js` with an SMS provider.

## Adding a new feature

1. Create `src/models/<name>.model.js`
2. Create `src/services/<name>.service.js`
3. Create `src/controllers/<name>.controller.js`
4. Create `src/routes/<name>.routes.js` and mount it in `src/routes/index.js`
