# Estate Desk

A private, single-company real estate WhatsApp workspace. React/Vite dashboard, Express/TypeScript API, PostgreSQL/Prisma storage, Google GenAI integration and Evolution Go with QR pairing.

## What is implemented

- Administrator login with bcrypt password hashes and signed HttpOnly session cookies.
- Property CRUD, URL-based images, availability changes, filters and pagination.
- Secret-protected webhook reception, persistent messages, WhatsApp-ID deduplication and a database-backed worker.
- Customer identity, bounded conversation history, incremental lead qualification and viewing requests.
- English, Urdu and Roman Urdu responses, strict database-grounded property cards, human escalation and takeover.
- Inbox, dashboard metrics, leads, viewing requests, configuration and a simulator.
- Provider timeouts, uncertain-delivery handling, sanitized errors, rate limits and automated critical-rule tests.

The software still needs your PostgreSQL instance and provider credentials for live operation. Configuration status is not proof of successful provider connectivity. Demo listings are fictional, explicitly labelled and excluded from live replies.

## Requirements

- Node.js 22.12+ (tested build environment: Node 24)
- npm 10+
- PostgreSQL 16+; Docker Compose is an optional local convenience
- Gemini API access for live AI
- A running, licensed Evolution Go service and a WhatsApp account that can link a device

## Local installation

Run in the repository root:

```powershell
npm ci
npm run dev
```

Open the exact localhost URL printed in the terminal. On the first visit, choose **Create your administrator account**, enter your name, your own email and a password of at least 14 characters. This is your login for future visits; the temporary preview credentials do not apply to this database.

When `DATABASE_URL` is empty or no `.env` exists, `npm run dev` automatically starts PostgreSQL, generates the Prisma client if needed and applies migrations. Account and property data persist under `.local-data/postgres`; random local secrets stay in ignored `.local-data` files. Do not delete that folder if you want to keep your data. Local development does not require Docker, a manual seed or API credentials. Frontend changes reload automatically; restart `npm run dev` after backend changes.

If an account already exists and you do not remember its password, keep the app running and run `npm run admin:reset` in another terminal. It lists local administrator emails and securely prompts for a replacement password without displaying it. The first-account setup is disabled after an administrator exists, and is disabled entirely in production.

To add Gemini/Evolution Go credentials or use a separately managed PostgreSQL database, copy `.env.example` to `.env` and edit it locally. Never paste secrets into chat or commit them. Set `DATABASE_URL` to use your own database instead of the automatic local one.

Optional manual database setup (set `DATABASE_URL=postgresql://estate:estate@localhost:5432/estate` in `.env` for this Compose example):

```powershell
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

If you choose to seed, first set `SEED_ADMIN_PASSWORD` to a unique password of at least 14 characters. Sign in with `SEED_ADMIN_EMAIL` and that password. Seeding does not reset an existing account. The Compose password is for local development only.

Frontend only: `npm run dev -w client`. Backend only: `npm run dev -w server`. The Vite proxy forwards `/api` to port 3001. The backend starts only after connecting to PostgreSQL; it also ensures singleton settings exist.

## Database and migrations

`prisma/schema.prisma` defines the data model. Apply committed migrations using `npm run db:migrate`. After a schema change, use `npm run db:dev -- --name describe_change`, then commit the generated migration. Never run development migration/reset commands against production.

The seed creates one administrator and six fictional Pakistani properties in Bahria Town/DHA in Rawalpindi, Islamabad and Lahore. One is sold to exercise filtering. Prices are PKR; rents are monthly. Demo properties cannot be recommended to real WhatsApp customers. Add actual inventory through Properties before enabling live conversations.

## Environment variables

All secrets are server-side. The client contains no `VITE_` credential variables.

| Variable                                   | Purpose                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `PORT`                                     | API port, normally 3001                                                                      |
| `DATABASE_URL`                             | PostgreSQL connection string; use TLS for hosted databases                                   |
| `CLIENT_URL`                               | Exact browser origin, e.g. `http://localhost:5173`; used for CORS and mutation-origin checks |
| `JWT_SECRET`                               | Random session-signing secret, at least 32 characters                                        |
| `GEMINI_API_KEY`                           | Google AI Studio Gemini API key                                                              |
| `GEMINI_MODEL`                             | Model available to your account; configurable without code changes                           |
| `EVOLUTION_API_URL`                        | Evolution Go origin, normally `http://localhost:8080`                                        |
| `EVOLUTION_INSTANCE_TOKEN`                 | Token assigned to the EstateDesk Evolution Go instance                                       |
| `EVOLUTION_INSTANCE_NAME`                  | Display name of the Evolution Go instance                                                    |
| `EVOLUTION_WEBHOOK_SECRET`                 | Random callback secret, at least 24 characters in production                                 |
| `PUBLIC_API_URL`                           | Public HTTPS origin of EstateDesk, used to configure the Evolution Go callback               |
| `MOCK_MODE`                                | Enables authenticated simulation; must be false in production                                |
| `NODE_ENV`                                 | `development`, `test` or `production`                                                        |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial administrator creation only                                                          |

## Gemini setup and safety boundary

Create an API key in Google AI Studio, place it in `GEMINI_API_KEY`, and choose an available model in `GEMINI_MODEL`. The backend uses the official `@google/genai` SDK and validates structured responses with Zod; timeouts or invalid responses mark the conversation for an agent.

Gemini extracts requirements and selects a response plan. It does **not** write SQL, choose nonexistent records, or emit unrestricted customer-facing prose. The server renders concise multilingual wording and property facts from locked database rows immediately before sending. This is a deliberate safety tradeoff: it guarantees factual inventory fields, but conversation phrasing is more constrained than unrestricted model text. Greetings/personality/custom instructions are available to model context; they cannot replace the enforced response vocabulary or inventory rules. General FAQs and unknown questions currently route to a person rather than risk an unsupported claim.

Lead extraction is probabilistic. Agents should review inferred requirements. Null values do not overwrite known fields. Internal lead notes and credentials are never sent to Gemini. A limited recent conversation window, customer name, selected lead fields and business context are sent to Google. Review this data flow against your company's privacy policy.

## Evolution Go / WhatsApp setup

1. Install and start [Evolution Go](https://github.com/evolution-foundation/evolution-go). It requires PostgreSQL and license activation through its Manager before business endpoints work.
2. Create an instance in Evolution Go. Use the same instance token in Evolution Go and `EVOLUTION_INSTANCE_TOKEN` in EstateDesk.
3. Set `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE_NAME`, a long random `EVOLUTION_WEBHOOK_SECRET`, and the public HTTPS `PUBLIC_API_URL` in EstateDesk.
4. Restart EstateDesk. Open **WhatsApp Settings**, choose **Start connection**, then **Show QR code**. In WhatsApp open **Linked devices → Link a device** and scan it.
5. Choose **Check status**. It must report connected before live testing.
6. Send a message to the linked WhatsApp number and verify the incoming message, Gemini response, lead update, and reply in EstateDesk.

EstateDesk asks Evolution Go to subscribe to `MESSAGE`, `READ_RECEIPT`, and `CONNECTION`. Evolution Go does not sign webhook requests, so the callback contains the random secret as a query parameter and EstateDesk compares it in constant time. Keep the full callback URL out of logs and screenshots. Incoming text is persisted transactionally with its job, then acknowledged; Gemini runs outside the webhook request.

Free-form outbound replies require an incoming customer message within the last 24 hours. This applies to AI and agents. Template messaging is not implemented, so the service blocks replies outside the window instead of attempting unsupported sends. Inbound non-text media is stored as a typed marker and assigned for human attention; media download/transcription is not implemented.

### Local webhook testing

Run `ngrok http 3001` after starting the API and set the resulting HTTPS origin as `PUBLIC_API_URL`. Restart EstateDesk and use **Start connection** so Evolution Go receives the new callback. Keep `CLIENT_URL` pointing at the local dashboard origin. Ngrok is a development tunnel, not a production hosting strategy.

## Simulation

Keep `MOCK_MODE=true` locally. In Conversations select **Simulate enquiry**, enter a test phone/name and send `5 marla house in Bahria under 2 crore`.

The simulator writes customers, conversations, messages, jobs and leads to PostgreSQL and uses the same worker, filters, renderer and takeover rules. It never calls Evolution Go. Without a Gemini key it uses a limited deterministic extractor; with a key it calls Gemini. Simulated conversations are isolated from live conversations even when their phone number matches. Every simulated outgoing message has `SIMULATED` status. Use actual inventory and actual provider tests before deployment.

## Human workflow

- **Take over** stops future AI sends and assigns the conversation to the current administrator. An already dispatched external message cannot be recalled.
- **Resume AI** clears takeover and allows future incoming messages to trigger AI. It does not replay old messages automatically.
- Manual sends require takeover. After a successful human reply, the conversation automatically returns to AI for the customer's next message. Failed or uncertain delivery keeps human takeover active. Sending and takeover share a database advisory lock so they cannot race.
- Viewings start as REQUESTED. An administrator may confirm/cancel/complete them in the dashboard; this only changes the internal record. Send a manual message to communicate an actual confirmation.
- Failed jobs and delivery outcomes requiring review appear in the overview/inbox. Do not resend an uncertain message until you check Evolution Go delivery state.

## Testing and build

```powershell
npm run typecheck
npm test
npm run build
```

Unit/HTTP tests do not require live credentials. They cover webhook authentication and payload parsing, authentication boundaries, duplicate-message handling, local units, null-safe lead updates, availability filtering, takeover guards and Evolution Go failure handling. See `docs/architecture.md` for reliability constraints and the deployment acceptance checklist.

## Production deployment

1. Provision PostgreSQL with TLS, backups, monitoring and a private network where possible.
2. Install with `npm ci`, generate Prisma, run `npm run build`, and apply `npm run db:migrate` through a controlled release step.
3. Seed the administrator once; remove the seed password from your runtime environment afterward. Replace demo inventory with verified actual listings.
4. Serve `client/dist` with an HTTPS static server, with SPA fallback to `index.html`. Proxy `/api` to the Node server on the same public origin. Set `CLIENT_URL` to that HTTPS origin.
5. Start `node server/dist/index.js` from the project root with environment variables supplied by your process manager. Set `NODE_ENV=production`, `MOCK_MODE=false`, valid secrets and provider credentials.
6. Restrict direct API port access, enforce HTTPS, configure process restart and collect structured stdout logs. Do not log proxy authorization/cookie headers or message bodies.
7. Verify `/api/health`, real provider flow, takeover, failure handling and backup restoration. Monitor FAILED jobs, UNKNOWN sends and database latency.

The current server uses in-process HTTP rate-limit counters. Use a shared edge limiter for multiple API instances. Configure proxy trust explicitly for your deployment before using forwarded client IPs; it is deliberately not enabled by default. Each process runs a worker; PostgreSQL coordinates job claims and conversation sends. Review database connection capacity because sends hold a transaction for up to 25 seconds.

## Security and troubleshooting

- Sessions are HttpOnly, SameSite=Strict and Secure in production. Unsafe methods require an exact allowed Origin. Cookie sessions expire after eight hours; rotate JWT_SECRET to revoke all sessions.
- There is no public signup, password reset, role system or multi-tenant organization model. Account provisioning is administrative.
- If login fails, verify seed credentials, exact `CLIENT_URL` origin and database connectivity. API tools must supply the correct Origin on mutations.
- If no webhook arrives, check `PUBLIC_API_URL`, restart the connection, and confirm Evolution Go subscribed to `MESSAGE`.
- If the webhook returns 401, ensure Evolution Go is using the callback generated by **Start connection** and that `EVOLUTION_WEBHOOK_SECRET` did not change.
- If Gemini fails, verify API key/model access/quota; the conversation moves to human attention. No automatic fabricated response is sent.
- If Evolution Go returns 401/429/5xx or a timeout, inspect the message's uncertain status and Evolution Manager. There is intentionally no automatic send retry.
- If PostgreSQL is unavailable, reception fails instead of acknowledging messages that were not saved; Evolution Go retries non-2xx webhooks.
- Limit access to the database and backups. Define a retention/deletion policy for customer messages and lead PII before rollout. The application does not automatically delete customer history.

## Integration references

- [Google GenAI SDK configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Evolution Go official repository](https://github.com/evolution-foundation/evolution-go)
- [Evolution Go message API](https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/guias-api/api-messages.md)
- [Evolution Go instance API](https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/guias-api/api-instances.md)
