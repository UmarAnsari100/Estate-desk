# Verified local behavior

Verified on Windows with Node 24 and isolated PostgreSQL databases:

- 25 unit/HTTP tests pass, including standalone English, Roman Urdu and Urdu greetings.
- Real PostgreSQL integration tests pass: first-account creation, rejection of concurrent second signup, authentication, signed webhook deduplication, safe property matching, lead updates, human takeover and messaging-window enforcement.
- Browser test passes the actual local workflow: automatic development database startup, first-admin signup, immediate login, a `hi` simulation receiving a greeting without listings, full application/database shutdown and restart, and login with the same saved account.
- TypeScript checks and production build pass.

The local browser test uses its own `.test-postgres` directory and does not create an administrator in the user's `.local-data` database. Production provider credentials are still required for live Gemini and WhatsApp testing.

Commands: `npm test`, `npm run test:integration`, `npm run test:first-run`, `npm run typecheck`, `npm run build`. The first-run browser test uses installed Chrome on Windows; elsewhere install Playwright Chromium first. PostgreSQL subprocess tests require normal local process permissions.
