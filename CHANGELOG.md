# Changelog

All notable changes to the Feelvie backend. Newest first.

## 2026-10-03

### Added

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
