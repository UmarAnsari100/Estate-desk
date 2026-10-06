# Architecture and operating boundaries

## Request paths

```text
Evolution Go -> callback-secret check -> PostgreSQL transaction
                                     customer/conversation/message/job
                                     -> HTTP 200

Worker -> claim durable job -> bounded history -> Gemini extraction
       -> incremental lead -> Prisma property query -> Gemini response plan
       -> conversation lock -> recheck AI/takeover/window
       -> lock/reload inventory -> deterministic multilingual rendering
       -> Evolution Go or simulation -> persisted outgoing status

React -> same-origin API -> session authentication -> validated services -> Prisma
```

`server/src/controllers` contains webhook HTTP concerns. `routes` exposes validated administrative APIs. `services` contains customer identity, conversation locking, lead updates, inventory matching, Gemini, WhatsApp, orchestration, response rendering and the durable worker. `repositories/db.ts` owns Prisma. `middleware`, `config`, `types` and `utils` isolate cross-cutting concerns.

## Schema

- Admin: account with unique email and password hash; optional conversation assignment.
- Customer: unique WhatsApp number, identity and optional email.
- Conversation: one per customer per transport (live/simulation), AI/takeover/status, recent timestamps and unread count.
- Message: incoming/outgoing content, sender, type, unique external ID, optional unique reply-to ID, status and metadata.
- ProcessingJob: one per incoming message, durable state and sanitized error.
- Property: unique code, typed purpose/status, location, numeric area/price, optional rooms, arrays of amenities/URLs; demo flag.
- Lead: one per conversation, partial requirements and status/score/notes.
- ViewingRequest: requested property/date/time/name, internal lifecycle status. No calendar booking is implied.
- BusinessSettings and AISettings: singleton records.

Prices and areas use PostgreSQL decimal columns. Search is implemented through Prisma filters; Gemini never controls query text. Current area matching requires exact numeric value and unit; marla/kanal conversions are not inferred because local conventions can differ. Rents use monthly PKR.

## Reliability

Webhook IDs are unique, with transaction-scoped per-phone locks protecting duplicate races. Customer/conversation/message/job persistence commits atomically. The worker serializes claims under a short global advisory lock and excludes conversations with an active job. Processing is sequential per conversation; independent processes can process different conversations.

AI generates outside the outbound transaction. Just before a send, the system locks the conversation, rechecks takeover and global AI state, checks the messaging window and prevents a second reply for the same incoming message. Relevant property rows are locked and reloaded so an availability edit cannot overtake the send. Manual replies require takeover and use the same lock. A successfully delivered human reply automatically resumes AI; failed or uncertain delivery preserves takeover.

Exactly-once delivery to an external HTTP provider is not promised. A process can fail after Evolution Go accepts a message but before database commit. PROCESSING jobs older than three minutes become FAILED and the conversation is escalated, with no automatic replay. Timeouts and send errors produce UNKNOWN outgoing status and human takeover. This prioritizes avoiding duplicate messages over automatic recovery. A human must check provider state before manually replying.

A takeover request waits for a currently executing send lock. Messages already submitted to Evolution Go cannot be canceled. Takeover suppresses responses still being generated and all subsequent sends after its transaction commits.

## Deliberate limits

- Text-only outbound messaging; unsupported inbound media escalates.
- No template messages outside the 24-hour service window.
- No calendar integration, automatic booking or financial/legal assertions.
- Constrained generated response plans, not unrestricted Gemini prose.
- No property upload storage; HTTPS image URLs are supported.
- No automatic retries for ambiguous provider deliveries.
- Lead/conversation lists return the latest 100 records; conversation detail returns the latest 100 messages. Inventory pages contain 30 properties. Add cursor pagination before larger-scale operations.
- Sessions have an eight-hour lifetime; per-session server revocation and administrator management UI are not implemented.
- Polling refreshes the inbox; WebSocket delivery is not implemented.

## Deployment acceptance checks

Before using real customer traffic, verify with your infrastructure and credentials:

1. Apply migrations against a disposable PostgreSQL database and seed it.
2. Replay the same authenticated Evolution Go event concurrently; expect one message/job/reply.
3. Simulate a search and compare results with actual AVAILABLE inventory; SOLD/demo records must not enter live recommendations.
4. Take over while Gemini is running; expect the final send to be suppressed.
5. Kill a worker after an external send; verify stale-job escalation and no automatic replay.
6. Exercise Evolution Go token failure, 429, timeout and delivered/read callbacks.
7. Verify customer service window expiry blocks manual and automatic free-form replies.
8. Restore a database backup and check secret handling, HTTPS and access controls.
