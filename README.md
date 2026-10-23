# Growth Goaled

Growth Intelligence platform for Series A B2B SaaS and AI companies.

- **Build instructions:** [`HANDOFF.md`](HANDOFF.md) — the single source of truth for Claude Code
- **Product spec:** [`docs/spec.md`](docs/spec.md)
- **Design reference:** [`prototype/`](prototype/) (Figma Make export, not deployed)

## Environments

| Branch | URL | Database |
|---|---|---|
| `main` | https://app.growthgoaled.com | Neon `main` |
| `dev` | https://dev.growthgoaled.com | Neon `dev` branch |

Work on `dev`; merge `dev` → `main` to release. Never commit directly to `main`.

## Local setup

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

Pull the Development env vars from Vercel instead of copying by hand: `vercel env pull .env.local`.
Local development points at the Neon `dev` branch.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection (app queries) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection (migrations) |
| `NEON_AUTH_BASE_URL` | Neon Auth URL for the matching Neon branch (Console → Better Auth → Project Info) |
| `NEON_AUTH_COOKIE_SECRET` | 32+ char secret that signs session cookies (`openssl rand -base64 32`) |
| `APP_URL` | Public URL; magic links return here and the STAGING badge shows when it is `dev.growthgoaled.com` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Invite emails via Resend (sender must be on a verified domain). Without a key the advisor is shown the invite link to share |
| `ANTHROPIC_API_KEY` | Claude API (document extraction now; Draft/QA agents from M8). Server-side only |
| `BLOB_READ_WRITE_TOKEN` | Private Vercel Blob store for uploaded documents |

Each Vercel environment points at its own Neon branch: Production → `main`, Preview and Development → `dev`.
Neon Auth is configured **per Neon branch**, so `NEON_AUTH_BASE_URL` differs between Production and Preview.

### Database and migrations

- Schema: `lib/db/schema.ts` (Drizzle). Migrations are committed in `drizzle/`.
- After changing the schema: `npm run db:generate -- --name <change>` and commit the new SQL.
- Apply locally: `npm run db:migrate`.
- On deploy, `npm run build` runs `scripts/migrate.mjs` first, migrating that environment's database over the unpooled URL. Neon Auth's own `neon_auth` schema is never touched.

### Intake

The five intake sections (Company, Customers, GTM, ICP, Hiring) are defined in `lib/intake.ts`, including which fields are required (that drives % complete). Answers autosave on blur to `intake_responses`. Numeric answers tied to a metric (ARR, growth, NRR, …) are also stored as accepted, company-provided data points, and mapped answers are mirrored onto the company row. When every required field is answered the company moves from the `intake` to the `upload` phase.

### Growth Data Readiness

Step 2 for founders is `/readiness` (`/upload` redirects there). It replaces a generic upload with an explicit checklist of the data Growth Goaled needs, in six categories (A Financial performance, B Customers and ICP, C CRM pipeline, D Marketing, E Product and retention, F Team and targets). The requirements, why each matters, typical source systems, suggested files, expected spreadsheet columns and which growth metrics each item enables all live in `lib/readiness.ts`.

- **Per-company records** (`data_items`, one row per company and item): status (not reviewed / available / partially available / missing / not applicable), collection method, source system, integration reference (a note only; no live connection), coverage start/end month, quality (unverified / validated / estimated), limitations, notes, advisor follow-up request, last reviewed by/at. Founders can mark data unverified or estimated; only advisors and admins can mark it validated or set follow-up requests, and a founder changing a validated item's substance resets it to unverified. Every query is filtered by the signed-in founder's company; the client never sends a company id.
- **Uploads** go into a category and optionally specific items (CSV, XLSX, PDF, DOCX; 25 MB). The browser hashes the file (SHA-256) so re-uploading the same file reuses the existing record (unique per company + hash) and just adds item links. Linking a file marks unreviewed items available and unverified.
- **Processing**: CSV/XLSX are profiled in code (columns, row counts, date range) before extraction, and those columns are checked against each linked item's expected fields. PDFs and spreadsheets then go through metric extraction (below). DOCX files are stored with status `stored` and are never reported as analysed.
- **Assessment** (`lib/readiness-assessment.ts`) is rule-based and reads only recorded statuses, file metadata and open conflicts. It reports three separate measures: collection completeness (required items supplied, partial counts half), data quality (validated/unverified/estimated, limitations, missing fields, short or outdated history, conflicts) and analytical readiness (which growth metrics are ready, limited or blocked, and what blocks them), plus the next most useful request and benchmark blockers. "Send to my advisor for the benchmark" moves the company to the `benchmark` phase only when no required item is unreviewed and no benchmark-critical metric is blocked.
- **Gap summary** (`lib/ai/readiness-summary.ts`): optional AI rewording of the assessment facts (names and statuses only, no values), saved with the facts in `readiness_assessments`. Throttled to one per two minutes.

### Documents and extraction

The browser sends the file straight to the **private** Blob store using a token from `/api/blob/upload`, which is only issued to founders and only for paths under `companies/<their company id>/`. The upload action then records the document and runs extraction after responding (`after()`, up to 300s).

Extraction (`lib/ai/extract.ts`) sends PDFs as document blocks and `.xlsx`/`.csv` files as CSV text to Claude (model set in `lib/ai/config.ts`), with the metrics dictionary as the allowed output. The JSON reply is validated with Zod and retried once if invalid. Each run is logged in `agent_runs`. Extracted values are stored as **proposed** data points for the founder to accept or reject. A value more than 10% away from an earlier one for the same metric and period opens a `conflict` register item; low-confidence or computed values open an `assumption` item. PowerPoint, `.xls`, `.doc` and Pages files are rejected with a request to export them as PDF, `.xlsx` or `.docx`.

### Seed data and the sample company

`scripts/seed.ts` seeds **Acme AI**, the read-only demo at `/sample` (no login), with its published Benchmark, data points, score and open questions. On staging it also seeds a fake advisory portfolio of six more companies. Figures come from `prototype/src/data/mock.ts` and are illustrative. The sample benchmark cohort is flagged `is_sample` so it is never matched to real companies.

- On deploy the build runs it automatically: Production gets Acme AI only, Preview (staging) gets Acme AI plus the portfolio.
- Locally: `npm run db:seed` (Acme AI + portfolio) or `npm run db:seed -- --sample-only`.
- It is idempotent: seed rows have fixed ids and are replaced on every run. Real users and companies are never touched. The script refuses to put the portfolio into production.
- Seeded people (Jamie Sterling, the advisor; Sam Avery, Acme's founder) cannot sign in.

### Auth and roles

Sign-in is a passwordless magic link (Neon Auth). Links return to `/auth/callback`, which finishes the session in the browser.

On first sign-in a row is created in `users` with role `founder`, and the user is sent to `/welcome` until they finish it:
- **Founders** give their name, title, company name, website and annual revenue band (<$1M, $1M–$3M, $3M–$10M, $10M–$20M, $20M–$50M). This creates the company in the unassigned queue with them as owner.
- **Advisors and admins** give their name and title.

**Invites and the unassigned queue.** Advisors invite a founder from **Portfolio** (email + company name). This creates the company in their portfolio and a single-use link (`/invite/<token>`, 14 days; only a hash is stored). The founder signs in with the invited email, joins the company, then fills in their profile on `/welcome`. Self-signed-up companies appear under **Unassigned**: advisors claim them; admins can assign them to any advisor.

Nobody can choose their own role. Admins change roles on **Users** (`/advisor/users`). To create the first admin (or from a terminal):

```bash
npm run user:role -- someone@example.com admin   # or advisor / founder; they must have signed in once
```

Founders land on `/dashboard` with the founder sidebar; advisors and admins land on `/advisor/portfolio`.
Role checks are enforced on the server (`lib/auth/session.ts`, `lib/access.ts`), not just in the UI.

### Checks

```bash
npm run typecheck
npm run lint
npm test          # Vitest (includes an in-memory Postgres suite via PGlite)
npm run build
```
