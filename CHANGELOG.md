# Changelog

All notable changes to the Feelvie backend. Newest first.

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
