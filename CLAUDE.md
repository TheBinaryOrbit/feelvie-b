# Feelvie Backend

Node.js + Express + MongoDB (Mongoose) REST API. ES modules. Entry point `src/server.js`.

## Commands

- `npm run dev` starts the server with nodemon.
- `npm run lint` lints `src`.

## Architecture

Layered: routes -> middleware -> controllers -> services -> models. Controllers hold no business logic. Services throw `ApiError`. See `docs/ARCHITECTURE.md`.

## Documentation rules (required on every change)

Whenever code changes, update the docs in the same commit:

- `docs/ARCHITECTURE.md`: structure, models, auth flow, middleware, config, env vars, known gaps.
- `docs/FRONTEND_GUIDE.md`: any endpoint, request body, response shape, status code or rate limit the app sees. Add a row to its "Changelog for frontend" table.
- `CHANGELOG.md`: one entry per change under the current date.
- Bump the `_Last updated_` date in each doc you touch.

## Commits

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- Commit each logical change separately. Never commit `.env`.
