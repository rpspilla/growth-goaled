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

### Questions and registers

Register items (`register_items`) are opened automatically by extraction (conflicts, assumptions) or by an advisor, and are owned by the founder or the advisor. Founders see their own company's founder-owned items on `/questions`: a Questions tab of open items and a Registers tab grouped by type. Ways to close an item (`lib/data/registers.ts`, validated by `resolveActionSchema` in `lib/registers.ts`):

- **Conflict**: keep one of the values (the chosen data point is accepted, the others rejected), or enter the correct figure (a new accepted data point with the same metric).
- **Assumption**: confirm the value we read, or enter the actual figure.
- **Missing / question / follow-up**: answer in words, or point at an uploaded file ("use uploaded data") for the advisor to check.
- **Mark as unknown**, with an optional note.

Every resolution records who closed it, how and when, and emits `register_item_resolved`. Advisors see items for the companies assigned to them (admins: all) on `/advisor/registers`, filtered by status, type and company. They can resolve any item, reopen closed ones and add new ones. Re-editing an intake answer makes that figure the accepted one again, even if a conflict had set it aside.

### Benchmark library

`/advisor/benchmarks` (advisors and admins) manages cohorts, their benchmark rows and sources (`lib/data/benchmarks.ts`, rules in `lib/benchmarks.ts`).

- **Cohorts**: name, criteria (stages, ARR range, business model, GTM motion), company count. The seeded sample cohort is read-only and never matched to real companies.
- **Rows** are `proposed`, `approved` or `retired`. Only approved rows may be used by agents or shown to founders. Approving needs a source and quartiles in a sensible order, and retires any other approved row for the same cohort, metric and period. Quartiles are direction-aware: `p75` is the *top quartile*, so for lower-is-better metrics (sales cycle, CAC payback, burn multiple) it's the smaller number.
- **CSV import** of the owner's advisory data: download the template from the page (`/advisor/benchmarks/template`), fill in `metric,p25,median,top_quartile,sample_size,period`, and import it with a source name. Rows arrive as proposed under one `advisory` source; bad rows are listed by line and skipped.
- **Research public benchmarks** (`lib/ai/research.ts`) runs Claude with the web search tool after the action responds (`after()`, up to 300s), logged in `agent_runs` (`agent = research`). It returns aggregates and citations only. In code, any source whose URL wasn't among the search results is dropped, as are rows pointing at it and rows with quartiles out of order; what was dropped is shown on the page. Everything kept is proposed until an advisor approves it.

### Benchmark deliverable pipeline

`lib/data/deliverables.ts` runs a Benchmark end to end. It starts when a founder sends their data from Data Readiness, or when an advisor clicks Generate on `/advisor/review`. The work runs after the response (`after()`, up to 300s) and each agent call is logged in `agent_runs`.

1. **Inputs, in code**: the company's latest *accepted* data point per metric; the best-matching cohort among non-sample cohorts with *approved* rows (`lib/cohort-match.ts`, rule-based on stage, ARR band, GTM motion and business model); the comparison rows (company value, cohort median and top quartile, ahead/behind); open register items; and the advisor's feedback when sent back. The methodology text is generated from the match, not by the model.
2. **Draft Agent** (`lib/ai/draft.ts`) writes only the narrative (headline, insight, strengths, watch areas, priority, missing inputs) and cites the data point / benchmark row IDs it was given. Table rows and their claims are built in code.
3. **QA Agent** (`lib/ai/qa.ts`) is a separate call that sees the input and the draft output only, and returns the five checks. Code checks (`lib/deliverables/checks.ts`) then verify every figure in the text matches an input value or a simple gap, and every claim cites a valid source; a code failure overrides the model's pass.
4. **Advisor gate** (`/advisor/review/[id]`): draft preview, QA results and run details side by side. *Approve* → `approved`, then *Publish* → visible to the founder (and phase moves to `baseline`). *Request changes* edits the text into a new version that's QA'd again. *Send back to AI* redrafts with the advisor's comment. Older versions become `changes_requested`.

Founders see progress on `/processing` (status only, never draft content) and the latest *published* version on `/benchmark`. Runs that haven't finished in 10 minutes show as stalled and can be restarted. Events: `review_decision`, `deliverable_published`, `deliverable_viewed`, `source_trail_opened`.

### Advisor portfolio and company view

`/advisor/portfolio` shows counts (active, requiring attention, awaiting founder input, in advisor review, complete) and a table of the advisor's companies (admins: all) built from accepted data, open registers, readiness and the latest Benchmark version (`lib/data/portfolio.ts`). A company needs attention when a Benchmark is waiting for review or publishing, a run failed, data conflicts are open, or its health is "at risk".

`/advisor/companies/[id]` shows metrics, score, benchmark position (published, or the current draft), phase, readiness, open questions and files. Advisors set health, keep an internal advisor summary (never shown to founders), and review the founder's data items: **Validate** supplied items and send **follow-up requests**, which the founder sees on the item and in the "most useful next step".

### Analytics

Events are recorded with `track()` (`lib/events.ts`): `intake_section_completed`, `document_uploaded`, `extraction_completed`, `register_item_resolved`, `review_decision`, `deliverable_published`, `deliverable_viewed`, `source_trail_opened`, `invite_sent`, `invite_accepted`. Admins see the derived metrics on `/advisor/analytics` (`lib/analytics.ts`, sample company excluded):

- **Activation**: companies with intake ≥80% and at least one document.
- **Sign-up to first Benchmark**: median hours from company creation to the first `deliverable_published`.
- **Source trails opened**: share of companies that viewed a Benchmark and opened a source trail.
- **Review turnaround**: median hours from QA complete to the advisor's decision.
- **Approved without changes**: published Benchmarks with no edit or send-back since the previous publish.
- Pilot → paid isn't tracked (no payments in Phase 1).

### End-to-end tests

`npm run test:e2e` starts a throwaway local Postgres (`e2e/db.sh`, needs Postgres 16 binaries; set `PG_BIN` if they live elsewhere), applies the migrations and runs `next dev` in **test mode** (`E2E_AUTH=1`, `lib/e2e.ts`). Test mode signs users in from a `gg_e2e_user` cookie instead of Neon Auth and replaces model calls with deterministic stubs (`lib/ai/fake.ts`). It only switches on under `next dev`, outside Vercel, with the variable set explicitly, so it can't be active on a deployment (covered by `tests/permissions.test.ts`).

- `e2e/journey.spec.ts`: advisor sets up a cohort (CSV import, approve rows); founder signs up, completes the company profile and Data Readiness, and hands off; the pipeline drafts and QAs; advisor claims, approves and publishes; founder sees the Benchmark with the approval note; portfolio and analytics reflect it.
- `e2e/access.spec.ts`: signed-out, founder and advisor access across areas, and advisors can't open companies that aren't theirs.
- File uploads aren't in the browser run (they need the real Blob store); they're covered by the integration tests with a mocked store and by the manual list in `docs/TESTING.md`.

Locally, `lib/db` also accepts a `postgres://…@localhost` URL (node-postgres); Neon's `db.batch` runs its queries in order there.

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
npm run test:e2e  # Playwright: full founder → advisor → founder journey and role access
npm run build
```
