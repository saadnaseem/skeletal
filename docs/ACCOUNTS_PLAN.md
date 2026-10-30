# Accounts, cloud projects and Free / Trial / Pro (plan, October 2026)

Status: proposal. Nothing here is built yet. Today the hosted site has optional Google sign-in (`server/auth.js`,
`migrations/0001_users.sql`) that stores only name, email and visit times; drawings never leave the browser.

## 1. Goals

1. People make an account (Google today; add email magic links later).
2. Signed-in users save projects to the cloud and reopen them on any device ("my projects" list).
3. The editor's autosave session syncs, so a tab that crashed or a different laptop picks up where they left off.
4. Plans: **Free** (everything local + a few cloud projects), **Trial** (Pro for 14 days, no card), **Pro** (paid).
5. The app stays offline-first. Local autosave and Save project (.html) keep working with no account.

## 2. Architecture on Cloudflare

| Piece | Cloudflare product | Why |
| --- | --- | --- |
| Static app (`site/index.html`) | Pages (as now) or Workers Static Assets | Already deployed this way |
| API (`/api/*`) | Pages Functions (as now), same `server/` code | One deploy; same origin, so cookies and CSP stay simple |
| Accounts, sessions, project list, plans | **D1** (SQLite) | Relational, already in use |
| Project contents (JSON, can be several MB with versions) | **R2** object storage | A D1 row/value is capped at about 2 MB; R2 has no practical cap and free egress |
| Rate limiting | Workers Rate Limiting binding | Stops abuse of save endpoints |
| Billing | **Stripe** (or Paddle / Lemon Squeezy as merchant of record) | Webhooks set the plan in D1 |

The rule: **D1 holds metadata and who-owns-what; R2 holds the bytes.** The API checks ownership in D1 before it
touches R2, and R2 is never public.

## 3. Database schema (proposed `migrations/0003_projects_plans.sql`)

```sql
-- Plans: the user's current entitlement. Stripe webhooks are the only writer of plan/sub fields.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';      -- free | trial | pro
ALTER TABLE users ADD COLUMN trial_ends_at INTEGER;                   -- ms; set once when a trial starts
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;

-- Several sign-in methods per person (Google now, email link / GitHub later). users.id stays the internal id.
CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,             -- 'google' | 'email' | 'github'
  subject TEXT NOT NULL,              -- provider's stable id (Google "sub", or the lowercased email)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
INSERT OR IGNORE INTO identities (provider, subject, user_id, created_at) SELECT 'google', id, id, created_at FROM users;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,                -- random id; also the R2 key suffix
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,-- bumped on every save; used for conflict detection (If-Match)
  bytes INTEGER NOT NULL,
  thumb_svg TEXT,                     -- small sanitized preview for the project list (optional)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                  -- soft delete; a scheduled job purges R2 + row after 30 days
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, updated_at DESC);

-- Pro: server-side history. Free keeps only the latest copy.
CREATE TABLE IF NOT EXISTS project_revisions (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, revision)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,                -- Stripe subscription id
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,               -- active | trialing | past_due | canceled ...
  price_id TEXT NOT NULL,
  current_period_end INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Webhook idempotency: Stripe retries, so each event is applied once.
CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);
```

R2 keys: `projects/<user_id>/<project_id>/<revision>.json`. The latest revision is the one in `projects.revision`.

## 4. Plan limits (one table in code, `server/plans.js`)

| | Free | Trial (14 days) | Pro |
| --- | --- | --- | --- |
| Everything local (drawing, NMR, exports, .html save) | yes | yes | yes |
| Cloud projects | 3 | unlimited | unlimited |
| Max project size | 5 MB | 50 MB | 50 MB |
| Server-side version history | latest only | 30 days | 1 year |
| Share read-only link (later) | no | yes | yes |

Effective plan = `pro` if an active subscription exists, else `trial` if `trial_ends_at > now`, else `free`.
Compute it on each request; never trust the client. When Pro lapses, nothing is deleted: projects over the Free
limit become read-only until the user upgrades or deletes some.

## 5. API

All routes need the session cookie, return JSON, and require `Origin` = site origin for writes (as `logout` does now).

| Route | Does |
| --- | --- |
| `GET /api/projects` | List the user's projects (from D1 only) |
| `POST /api/projects` | Create: checks the plan's project count and size, writes R2, inserts row |
| `GET /api/projects/:id` | Ownership check in D1, stream JSON from R2 |
| `PUT /api/projects/:id` + `If-Match: <revision>` | Save. `412` if someone saved a newer revision (the app offers "keep both") |
| `DELETE /api/projects/:id` | Soft delete |
| `POST /api/trial/start` | Sets `trial_ends_at` once per user |
| `POST /api/billing/checkout` / `POST /api/billing/portal` | Create Stripe Checkout / Customer Portal sessions |
| `POST /api/stripe/webhook` | Verify the `Stripe-Signature` HMAC with Web Crypto, dedupe by event id, update `subscriptions` + `users.plan` |

The server must run the uploaded JSON through the same field whitelist as `sanitizeDoc()` (or at least reject
non-JSON and oversized bodies), and the client must still sanitize on load, as it does today.

## 6. Changes in the app

- `saveNow()` / `autosave()` in `src/app.js` are the hook. When the project has `project.cloudId` and the user is
  signed in, a debounced (about 5 s) `PUT` follows the local save. localStorage stays the first copy, so offline still works.
- New "My projects" dialog (list, open, rename, delete) and "Save to cloud" in the Project section.
- Conflict handling: on `412`, keep the local copy as a new project rather than overwriting either.
- Upgrade prompts appear only when a limit is hit, never on startup.

## 7. Things that must change before launch

- **Privacy policy and README.** Both currently promise "drawings are never uploaded". Cloud save must be opt-in,
  and the privacy page must say what is stored, where (Cloudflare R2/D1), for how long, and how to delete it.
  Account deletion must also delete the user's R2 objects.
- **Terms of service and refund policy** before taking payment.
- **Sales tax / VAT.** Stripe Tax, or use a merchant of record (Paddle, Lemon Squeezy) so they handle it.
- **Backups.** D1 Time Travel gives 30-day point-in-time restore; turn on R2 object versioning or a nightly copy.

## 8. Suggested order

1. Merge sign-in to `main` and deploy it (accounts already work).
2. Migration 0003 + `identities` + `projects` API + R2 binding, behind a feature flag. Tests: extend
   `tests/e2e/test_account.py`, which already runs the real Functions with a local D1 under `wrangler pages dev`.
3. "My projects" UI + autosave sync. Update the privacy page in the same release.
4. Plan limits + trial (no payment yet). Watch usage.
5. Stripe Checkout, webhook, Customer Portal. Test with Stripe test mode and the Stripe CLI (`stripe listen`).
