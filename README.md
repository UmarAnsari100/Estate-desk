# Estate Desk

A private, single-company real estate WhatsApp workspace. React/Vite dashboard, Express/TypeScript API, PostgreSQL/Prisma storage, Google GenAI integration and the official Meta WhatsApp Cloud API. No QR sessions, scraping or unofficial WhatsApp libraries.

## What is implemented

- Administrator login with bcrypt password hashes and signed HttpOnly session cookies.
- Property CRUD, URL-based images, availability changes, filters and pagination.
- Signed webhook reception, persistent messages, WhatsApp-ID deduplication and a database-backed worker.
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
- Meta Business account, a WhatsApp Business Account and registered Cloud API phone number for real WhatsApp messages

## Local installation

Run in the repository root:

```powershell
npm ci
npm run dev
```

Open the exact localhost URL printed in the terminal. On the first visit, choose **Create your administrator account**, enter your name, your own email and a password of at least 14 characters. This is your login for future visits; the temporary preview credentials do not apply to this database.

When `DATABASE_URL` is empty or no `.env` exists, `npm run dev` automatically starts PostgreSQL, generates the Prisma client if needed and applies migrations. Account and property data persist under `.local-data/postgres`; random local secrets stay in ignored `.local-data` files. Do not delete that folder if you want to keep your data. Local development does not require Docker, a manual seed or API credentials. Frontend changes reload automatically; restart `npm run dev` after backend changes.

If an account already exists and you do not remember its password, keep the app running and run `npm run admin:reset` in another terminal. It lists local administrator emails and securely prompts for a replacement password without displaying it. The first-account setup is disabled after an administrator exists, and is disabled entirely in production.

To add Gemini/Meta credentials or use a separately managed PostgreSQL database, copy `.env.example` to `.env` and edit it locally. Never paste secrets into chat or commit them. Set `DATABASE_URL` to use your own database instead of the automatic local one.

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
| `WHATSAPP_ACCESS_TOKEN`                    | Meta access token with WhatsApp messaging permission                                         |
| `WHATSAPP_PHONE_NUMBER_ID`                 | Meta phone-number object ID, not the phone number                                            |
| `WHATSAPP_BUSINESS_ACCOUNT_ID`             | Your WABA ID for setup/reference                                                             |
| `WHATSAPP_VERIFY_TOKEN`                    | Random value you choose and enter in Meta webhook configuration                              |
| `WHATSAPP_APP_SECRET`                      | App secret used to authenticate incoming webhook signatures                                  |
| `WHATSAPP_GRAPH_VERSION`                   | Explicit Graph API version; example is v23.0, review against your app's supported versions   |
| `MOCK_MODE`                                | Enables authenticated simulation; must be false in production                                |
| `NODE_ENV`                                 | `development`, `test` or `production`                                                        |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial administrator creation only                                                          |

## Gemini setup and safety boundary

Create an API key in Google AI Studio, place it in `GEMINI_API_KEY`, and choose an available model in `GEMINI_MODEL`. The backend uses the official `@google/genai` SDK and validates structured responses with Zod; timeouts or invalid responses mark the conversation for an agent.

Gemini extracts requirements and selects a response plan. It does **not** write SQL, choose nonexistent records, or emit unrestricted customer-facing prose. The server renders concise multilingual wording and property facts from locked database rows immediately before sending. This is a deliberate safety tradeoff: it guarantees factual inventory fields, but conversation phrasing is more constrained than unrestricted model text. Greetings/personality/custom instructions are available to model context; they cannot replace the enforced response vocabulary or inventory rules. General FAQs and unknown questions currently route to a person rather than risk an unsupported claim.

Lead extraction is probabilistic. Agents should review inferred requirements. Null values do not overwrite known fields. Internal lead notes and credentials are never sent to Gemini. A limited recent conversation window, customer name, selected lead fields and business context are sent to Google. Review this data flow against your company's privacy policy.

## Meta / WhatsApp setup

1. Create a Meta developer app with the WhatsApp product and connect your business/WABA.
2. Register a Cloud API phone number and configure a production token with `whatsapp_business_messaging` permission. Use a suitable business/system-user token for deployment rather than a short-lived testing token.
3. Put the token, phone-number ID, WABA ID, app secret and your own random verify token into the server environment.
4. Expose the API over HTTPS. Set the callback to `https://your-api-host/api/whatsapp/webhook` and enter the matching verify token.
5. Subscribe the app to the WABA and the `messages` webhook field. Incoming messages and delivery/read notifications arrive through this subscription.
6. Send an actual customer message to your business number and verify reception, a stored message, an AI reply, and delivery/read status in the inbox. Use Meta's test-number/recipient controls while your app is in testing mode.

GET verification validates mode/token and returns the challenge. POST requests must pass HMAC SHA-256 verification over exact raw bytes. Events for a different phone-number ID are ignored. Incoming text is persisted transactionally with its job, then acknowledged; Gemini runs outside the webhook request.

Free-form outbound replies require an incoming customer message within the last 24 hours. This applies to AI and agents. Template messaging is not implemented, so the service blocks replies outside the window instead of attempting unsupported sends. Inbound non-text media is stored as a typed marker and assigned for human attention; media download/transcription is not implemented.

### Local webhook testing

Run `ngrok http 3001` after starting the API. Use the resulting HTTPS URL plus `/api/whatsapp/webhook` in Meta. Keep `CLIENT_URL` pointing at the local dashboard origin. Ngrok is a development tunnel, not a production hosting strategy. A successful verification challenge alone does not demonstrate end-to-end messaging.

## Simulation

Keep `MOCK_MODE=true` locally. In Conversations select **Simulate enquiry**, enter a test phone/name and send `5 marla house in Bahria under 2 crore`.

The simulator writes customers, conversations, messages, jobs and leads to PostgreSQL and uses the same worker, filters, renderer and takeover rules. It never calls Meta. Without a Gemini key it uses a limited deterministic extractor; with a key it calls Gemini. Simulated conversations are isolated from live conversations even when their phone number matches. Every simulated outgoing message has `SIMULATED` status. Use actual inventory and actual provider tests before deployment.

## Human workflow

- **Take over** stops future AI sends and assigns the conversation to the current administrator. An already dispatched external message cannot be recalled.
- **Resume AI** clears takeover and allows future incoming messages to trigger AI. It does not replay old messages automatically.
- Manual sends require takeover. After a successful human reply, the conversation automatically returns to AI for the customer's next message. Failed or uncertain delivery keeps human takeover active. Sending and takeover share a database advisory lock so they cannot race.
- Viewings start as REQUESTED. An administrator may confirm/cancel/complete them in the dashboard; this only changes the internal record. Send a manual message to communicate an actual confirmation.
- Failed jobs and delivery outcomes requiring review appear in the overview/inbox. Do not resend an uncertain message until you check Meta delivery state.

## Testing and build

```powershell
npm run typecheck
npm test
npm run build
```

Unit/HTTP tests do not require live credentials. They cover signatures, webhook challenge, authentication boundaries, duplicate-message handling, local units, null-safe lead updates, availability filtering, takeover guards and Meta failure handling. See `docs/architecture.md` for reliability constraints and the deployment acceptance checklist.

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
- If no webhook arrives, check public HTTPS access, WABA subscription, phone-number ID and Meta's test recipient restrictions.
- If signatures fail, confirm you used the **app secret**, not the verify token or access token.
- If Gemini fails, verify API key/model access/quota; the conversation moves to human attention. No automatic fabricated response is sent.
- If Meta returns 401/429/5xx or a timeout, inspect the message's uncertain status and provider dashboard. There is intentionally no automatic send retry.
- If PostgreSQL is unavailable, reception fails instead of acknowledging messages that were not saved; Meta can retry them.
- Limit access to the database and backups. Define a retention/deletion policy for customer messages and lead PII before rollout. The application does not automatically delete customer history.

## Integration references

- [Google GenAI SDK configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Meta official text-message request](https://www.postman.com/meta/whatsapp-business-platform/request/8gvd47s/send-text-message)
- [Meta official webhook payload reference](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference)
- [Meta Graph webhook setup](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
