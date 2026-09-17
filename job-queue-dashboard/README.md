# Mini Job Queue Dashboard

A small job queue manager: NestJS + TypeORM on the backend, React + Vite on the frontend.

- **Live frontend:** _add your deployed URL here_
- **Live API:** _add your deployed URL here_

The interesting part of this assignment is not the CRUD — it is the status transition rule and what happens when two people trigger it at the same time. That reasoning is in [Concurrency](#concurrency), and there is a script that proves the behaviour: [`scripts/race-test.mjs`](scripts/race-test.mjs).

---

## Running it locally

Two terminals. The backend defaults to SQLite, so there is no database to install.

**Backend** (port 3000)

```bash
cd backend
cp .env.example .env
npm install
npm run start:dev
```

**Frontend** (port 5173)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

To use Postgres instead, set `DB_TYPE=postgres` and `DATABASE_URL` in `backend/.env`.

**Tests**

```bash
cd backend && npm test          # state machine unit tests
node scripts/race-test.mjs      # concurrency check against a running API
```

---

## API

Base URL: the backend origin. All responses are JSON except `DELETE`, which returns `204 No Content`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/jobs` | Create a job. Body: `{ title, type }`. Always starts as `pending`. |
| `GET` | `/jobs` | List jobs, newest first. Optional `?status=pending\|running\|completed\|failed`. |
| `GET` | `/jobs/stats` | Counts per status plus a total. |
| `GET` | `/jobs/:id` | One job. |
| `GET` | `/jobs/:id/history` | Audit trail of that job's status changes. |
| `PATCH` | `/jobs/:id/status` | Change status. Body: `{ status, expectedVersion? }`. |
| `DELETE` | `/jobs/:id` | Delete a job. |
| `GET` | `/health` | Liveness plus a database check, for the host's health probe. |

A job looks like this:

```json
{
  "id": "0d1f8c2e-...",
  "title": "Send weekly digest",
  "type": "email",
  "status": "pending",
  "version": 1,
  "createdAt": "2026-09-16T11:17:55.000Z",
  "updatedAt": "2026-09-16T11:17:55.000Z"
}
```

`version` starts at 1 and increments on every status change. It is what lets a client detect that it is looking at stale data.

### Errors

Every error has the same shape, so the client never has to guess:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A job cannot go from pending to completed.",
  "currentStatus": "pending",
  "currentVersion": 1,
  "attemptedStatus": "completed",
  "allowedTransitions": ["running"],
  "path": "/jobs/.../status",
  "timestamp": "2026-09-16T11:17:55.331Z"
}
```

| Code | When |
| --- | --- |
| `400` | Validation failed — bad status value, empty title, unknown field, malformed UUID. |
| `404` | No job with that id. |
| `409` | The transition is not legal from the job's current status, or the job changed since the client read it. |
| `500` | Unexpected. Logged with a stack trace server-side; the client gets a generic message. |

`409` carries `currentStatus` and `allowedTransitions` so the UI can correct itself without a second request.

---

## Concurrency

> Two tabs both see a job as `pending`. Both click "Start" at the same moment.

### Where the rule is enforced

**In the database, as part of the write itself.** Not in React, and not in a JavaScript `if` in the service.

The tempting version is:

```ts
const job = await repo.findOne({ where: { id } });   // reads "pending"
if (!canTransition(job.status, next)) throw ...       // passes
job.status = next;
await repo.save(job);                                 // writes "running"
```

This is a check-then-act race. Both requests can execute the read before either executes the write, both see `pending`, both pass the check, and both write. The rule is enforced against a value that was already stale by the time it was used.

Instead, the check and the write are a single statement, so the database evaluates the condition and writes the row under the same lock:

```sql
UPDATE jobs
   SET status = 'running', version = version + 1
 WHERE id = $1
   AND status IN ('pending');   -- the allowed predecessors of 'running'
```

Whichever request the database serialises first changes the row to `running`. The second one's `WHERE` clause no longer matches, so it updates zero rows. The service reads `affected`: 1 means the transition happened, 0 means it did not, and the request gets a `409` explaining why. There is no window between checking and acting, because there is no separate check.

The allowed predecessors come from one table in [`job-status.ts`](backend/src/jobs/job-status.ts), written as "which statuses may precede this one" precisely so it can be dropped into that `WHERE` clause.

### If someone bypasses React and calls the API directly

Nothing changes, which is the point. The frontend only hides buttons that would not work — that is a convenience so users are not offered dead actions. It is not a control.

A direct `curl` to `PATCH /jobs/:id/status` goes through the same three layers as the UI:

1. **Validation** rejects anything that is not one of the four statuses, and rejects unknown fields outright (`forbidNonWhitelisted`), so a client cannot smuggle in `status` on create or sneak extra columns into an update.
2. **The guarded UPDATE** rejects illegal transitions regardless of caller.
3. **The route shape** means status is the only mutable field. There is no `PATCH /jobs/:id` that accepts arbitrary columns, so `status` cannot be changed as a side effect of editing a title.

```bash
# completed -> running, straight at the API
$ curl -X PATCH $API/jobs/$ID/status -H 'Content-Type: application/json' -d '{"status":"running"}'
{"statusCode":409,"message":"This job is completed and cannot change status again.", ...}
```

### Two requests arriving at nearly the same time

Exactly one succeeds. The other gets `409` with a message naming the actual current status. `scripts/race-test.mjs` fires 2 and then 10 simultaneous `pending → running` requests at one job and asserts the outcome:

```
Two tabs: 2 simultaneous PATCH -> running
  200 OK        : 1
  409 Conflict  : 1
  final status  : running  version: 2
  audit entries : 1
  VERDICT       : PASS

Ten clients: 10 simultaneous PATCH -> running
  200 OK        : 1
  409 Conflict  : 9
  final status  : running  version: 2
  audit entries : 1
  VERDICT       : PASS
```

Ten requests, one state change, one audit row. The losing tab is told what happened and refetches, so it lands on the truth rather than showing a job that looks pending to one user and running to another.

### Preventing invalid or inconsistent state

Four things, in layers:

- **Illegal transitions are impossible to write**, per the guarded `UPDATE` above. `completed` and `failed` have no outgoing transitions, so a finished job is frozen. Nothing leads back to `pending`.
- **Stale writes are rejected**, even legal-looking ones. The client may send `expectedVersion` — the version it last saw — which is added to the same `WHERE` clause. A tab that has been open for ten minutes cannot act on what it *thinks* the job is. The frontend sends this on every status change.
- **The job and its audit trail cannot disagree**, because the status change and the audit insert happen in one transaction. If the insert fails, the status change rolls back with it.
- **Bad input never reaches the database**, via DTO validation with a whitelist.

### One honest caveat about SQLite

TypeORM's SQLite driver gives the whole process a single connection, so two overlapping transactions produce `cannot start a transaction within a transaction` — the concurrent requests fail with a 500 instead of a clean 409. I hit this while writing the race test.

[`TransactionRunner`](backend/src/common/transaction-runner.ts) queues transactions when the driver is SQLite, and passes straight through on Postgres, where the connection pool gives each request its own connection.

Worth being clear about what that queue is and is not doing. It is a workaround for a single-connection driver, not the thing that makes transitions safe. The guarded `UPDATE` is what makes them safe, and it stays correct with the queue removed and several server instances running behind a load balancer — the queue only serialises one process, the `UPDATE` serialises everybody. This is also why the deployed database is Postgres and SQLite is only the local default.

---

## Deployment

**Backend** — [`render.yaml`](render.yaml) is a Render blueprint that provisions Postgres and the API together and wires `DATABASE_URL` in. After the frontend is deployed, set `CORS_ORIGINS` to its URL. There is also a [`Dockerfile`](backend/Dockerfile) if you would rather host it anywhere that takes a container. Health checks point at `/health`.

**Frontend** — a static Vite build. Root directory `frontend`, build command `npm run build`, output `dist`, and set `VITE_API_URL` to the deployed API origin. `vercel.json` and `netlify.toml` are both included with the SPA rewrite.

---

## Decisions and trade-offs

**`failed` is only reachable from `running`.** The brief's diagram branches to `failed` after `running`, so I read it strictly: a `pending` job cannot be marked failed. It is one line to change — add `PENDING` to `ALLOWED_PREDECESSORS[FAILED]` and nothing else in the codebase moves.

**Re-applying the same status is a `409`, not a no-op.** `running → running` is rejected. Treating it as success would be friendlier to retries but would hide the "someone else got here first" signal that the whole feature is about. A stricter API is the right trade for this system; if the client needed retry-safety I would add an idempotency key rather than loosen the rule.

**`synchronize: true`.** TypeORM creates the schema on boot. Right for an assignment, wrong for production, where this would be off with generated migrations run as a deploy step.

**Counts come from the server**, as a `GROUP BY`, not from counting the array in React. The client only holds the current filter's jobs, so counting locally would be wrong the moment a filter is applied, and it would not scale past one page of results.

**Filtering is server-side too**, so the list does not have to be fully loaded to be filtered — the same reason.

**Polling every five seconds** keeps a second tab roughly in sync. It is the crude option; the right one is below.

**No auth.** Out of scope for the brief, so there is no notion of who changed a job — the audit log records the transition but not an actor.

---

## Bonus: the production-readiness improvement

**An append-only audit log of every status change** (`job_transitions`, written in the same transaction as the change).

I chose it because of what this system is. A job queue's entire value is that its state is trustworthy, and the hardest bugs in one are exactly the kind this assignment asks about: two writers, a disputed outcome, and a row that only shows you the final answer. `status` tells you where a job ended up. It cannot tell you how it got there, how long it sat pending, or whether that `failed` job was failed twice by two different people.

The log makes the race test verifiable — "exactly one audit entry" is a stronger assertion than "the status looks right", because it catches a double-write that happened to land on the same value. It is also the foundation for the things you would want next: queue latency metrics come from the gap between `createdAt` and the `pending → running` entry, and adding a user id to the table turns it into a proper "who did this" trail.

It costs one small table and one insert per transition, and because it is written inside the same transaction, it cannot drift out of sync with the job it describes.

---

## With more time

- **WebSockets or SSE instead of polling.** The server already knows the moment a transition commits; pushing it would make the second tab update instantly and drop the polling traffic entirely.
- **Migrations instead of `synchronize`**, so schema changes are reviewable and reversible.
- **Actual job execution.** Right now `running` is a label a human applies. A real queue would have workers claiming jobs — and the claim would use the same guarded `UPDATE`, which is what makes it safe for two workers to poll the same table.
- **Pagination on `GET /jobs`.** Fine at assignment scale, not at ten thousand jobs.
- **E2E tests for the API**, covering the transition matrix against a real Postgres in CI. The current tests cover the state machine in isolation, and the race script has to be run by hand.
- **Structured logging with request ids**, so a 409 in production can be traced to the request that caused it.
- **Rate limiting** on the write endpoints.
