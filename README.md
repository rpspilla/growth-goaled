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

Founders see this on the **Data** step (`/data`), scoped to the active use case: only that use case's items, grouped as needed for the baseline / sharpens it / optional, each with a "why it matters" line from the registry (`itemWhy`), a **Ready for analysis** meter (`lib/use-cases/readiness.ts`, ready when every required item is available, partial or N/A and at least one is supplied) and, for Growth Leak, "Analyze my data" (starts the draft → QA → review pipeline and moves the use case to `baseline_in_review`). Underneath, the full checklist still exists in six categories (A Financial performance, B Customers and ICP, C CRM pipeline, D Marketing, E Product and retention, F Team and targets). The requirements, why each matters, typical source systems, suggested files, expected spreadsheet columns and which growth metrics each item enables all live in `lib/readiness.ts`.

- **Per-company records** (`data_items`, one row per company and item): status (not reviewed / available / partially available / missing / not applicable), collection method, source system, integration reference (a note only; no live connection), coverage start/end month, quality (unverified / validated / estimated), limitations, notes, advisor follow-up request, last reviewed by/at. Founders can mark data unverified or estimated; only advisors and admins can mark it validated or set follow-up requests, and a founder changing a validated item's substance resets it to unverified. Every query is filtered by the signed-in founder's company; the client never sends a company id.
- **Uploads** go into a category and optionally specific items (CSV, XLSX, PDF, DOCX; 25 MB). The browser hashes the file (SHA-256) so re-uploading the same file reuses the existing record (unique per company + hash) and just adds item links. Linking a file marks unreviewed items available and unverified.
- **Processing**: CSV/XLSX are profiled in code (columns, row counts, date range) before extraction, and those columns are checked against each linked item's expected fields. PDFs and spreadsheets then go through metric extraction (below). DOCX files are stored with status `stored` and are never reported as analysed.
- **Assessment** (`lib/readiness-assessment.ts`) is rule-based and reads only recorded statuses, file metadata and open conflicts. It reports three separate measures: collection completeness (required items supplied, partial counts half), data quality (validated/unverified/estimated, limitations, missing fields, short or outdated history, conflicts) and analytical readiness (which growth metrics are ready, limited or blocked, and what blocks them), plus the next most useful request and blockers. It feeds the advisor's company view and the completion steps; the founder's Data page shows only the use case meter.

### Upload whatever you have

The Data step has a drop zone: "Upload whatever you have and we'll help you get organized". Founders can drag or pick up to 25 files at once, in **any format** (25 MB each). These go to the company's `inbox/` folder in Blob, the only place upload tokens allow any content type.

- Readable files (CSV, XLSX, PDF, text, PNG/JPEG/WebP/GIF images) are profiled and run through metric extraction as usual, then **sorted** (`sortDocument`): spreadsheet columns are matched to each item's expected fields in code (`lib/sorting.ts`), and Claude (`lib/ai/classify.ts`) reads a bounded preview (first rows/columns of each sheet, or the PDF/image) and suggests checklist items per sheet, using only the fixed item keys. Runs are logged in `agent_runs` (`agent = sort`).
- **Google links**: founders can paste a Google Sheets, Docs, Slides or Drive file link shared with "anyone with the link". We read the file id and download Google's own export (Sheets as .xlsx, Docs and Slides as PDF; `lib/google-link.ts`), following redirects only within Google hosts, with a 25 MB cap and timeout, then store a private copy in the inbox (with `source_url`) and process it like a dropped file. Unshared files get a clear message. Later edits in Google aren't synced.
- Other formats (PowerPoint, .xls, Keynote, Word…) are stored for the advisor, never reported as analysed, and get low-confidence suggestions from the file name only.
- **Remove** (on every file card) deletes the file and its blob and undoes its effects: proposed values deleted, accepted values set aside (published deliverables keep their trail), open questions raised from its values closed, and checklist items only that file made available (no other file, no founder details) reset to "not reviewed".
- Suggestions are just that: the founder confirms them in "We sorted your files" (high/medium pre-ticked, any item can be added). Only confirmed items are linked to the file and marked available (unverified). If the model fails, the column matches are still offered.

### Documents and extraction

The browser sends the file straight to the **private** Blob store using a token from `/api/blob/upload`, which is only issued to founders and only for paths under `companies/<their company id>/`. The upload action then records the document and runs extraction after responding (`after()`, up to 300s).

**Calculated figures** (`lib/metrics-engine/`): spreadsheets and CSVs are first analysed in code, deterministically and without the model. Revenue tables (long: month | customer | MRR; or wide: customers down, months across; ARR columns are divided by 12) give ARR (12 × latest MRR), 3-month compound monthly growth, year-over-year growth and, with per-customer rows, the ARR bridge (new, expansion, contraction, churn over the last 12 months or the months available), NRR, GRR, largest-customer concentration and ACV. Opportunity exports give win rate, median sales cycle of won deals and founder-closed share over the 12 months to the last close date, plus win rate by source, segment, industry, size and owner (fewer than 5 closed deals is flagged as too few to compare). P&Ls give gross margin and runway (latest cash ÷ average burn over up to 3 months). A P&L "Revenue" line isn't treated as recurring unless it says MRR/ARR/recurring. Each figure is stored as a data point with `origin = calculated`, its period, the method in words and its source (sheet, rows, columns, sample size); the full analysis (bridge, segments, pipeline, monthly series, warnings) is kept on `documents.analysis`. The model then only extracts what wasn't calculated, and its figures are `origin = extracted`; entered ones are `manual`. Hand-checked examples are in `tests/metrics-engine.test.ts`.

Extraction (`lib/ai/extract.ts`) sends PDFs as document blocks and `.xlsx`/`.csv` files as CSV text to Claude (model set in `lib/ai/config.ts`), with the metrics dictionary as the allowed output. The JSON reply is validated with Zod and retried once if invalid. Each run is logged in `agent_runs`. Extracted values are stored as **proposed** data points for the founder to accept or reject. A value more than 10% away from an earlier one for the same metric and period opens a `conflict` register item; low-confidence or computed values open an `assumption` item. PowerPoint, `.xls`, `.doc` and Pages files are rejected with a request to export them as PDF, `.xlsx` or `.docx`.

### Questions and registers

Register items (`register_items`) are opened automatically by extraction (conflicts, assumptions) or by an advisor, and are owned by the founder or the advisor. Founders see their own company's founder-owned items on `/questions`: a Questions tab of open items and a Registers tab grouped by type. Ways to close an item (`lib/data/registers.ts`, validated by `resolveActionSchema` in `lib/registers.ts`):

- **Conflict**: keep one of the values (the chosen data point is accepted, the others rejected), or enter the correct figure (a new accepted data point with the same metric).
- **Assumption**: confirm the value we read, or enter the actual figure.
- **Missing / question / follow-up**: answer in words, or point at an uploaded file ("use uploaded data") for the advisor to check.
- **Mark as unknown**, with an optional note.

Every resolution records who closed it, how and when, and emits `register_item_resolved`. Advisors see items for the companies assigned to them (admins: all) on `/advisor/registers`, filtered by status, type and company. They can resolve any item, reopen closed ones and add new ones. Re-editing an intake answer makes that figure the accepted one again, even if a conflict had set it aside.

### Benchmark Library (assessments)

`/advisor/benchmark-library` (sidebar: **Benchmark Library**) is where benchmark data for assessments lives. Advisors can read it; only admins can change it (checked in `lib/data/benchmark-library.ts` and in every server action). Founders never see it. Rules are pure modules in `lib/benchmark-library/` with unit tests.

- **Model** (migration `0015_benchmark_library`): `benchmark_sources` (publisher, URL or document reference, publication date, collection period, type: published report / licensed dataset / internal research / aggregated customer data, attribution, licence restrictions, *customer display* and *derived figures* permissions (both off until an admin confirms the licence), reliability, last verified, update frequency, review interval, and for customer data a consent reference and minimum cohort size) → `benchmark_datasets` (name, description, source, company types, business models, archived) → `benchmark_dataset_versions` (draft → validated → published → archived, effective and publication dates, who published, last reviewed, change history) → `benchmark_records` (metric, display name, definition, whether it matches Growth Goaled's definition, unit, value type, statistic (median, mean, percentile with its number, min, max, range), value or low/high, stages, ARR and ACV ranges, industry, business and pricing model, segment, geography, period and period basis, cohort definition, sample size, methodology, limitations). Plus `benchmark_imports` (every CSV import: file, who, when, counts, errors, column map, private Blob copy when configured), `benchmark_usages` (which report used which records) and `benchmark_overrides` (an advisor's per-company choice).
- **Versions**: published versions are immutable. Changing anything means a new draft (a copy of the published records), which must be validated and published; publishing archives the previous version. Records a report used can't be deleted (`ON DELETE RESTRICT`).
- **Validation** (`records.ts`): required fields, numbers, units against the metric dictionary, value type vs unit, percentile 1–99, range low ≤ high, percentages between −100 and 1000 (fractions like 0.95 are flagged), stages from a fixed list, ARR/ACV bounds, duplicates (same metric, statistic, cohort and period), contradictory cohort descriptions, and percentiles that decrease. Template rows marked PLACEHOLDER can't be imported. Aggregated customer data can only be published with consent recorded and every cohort at or above its minimum size.
- **CSV import** (dataset → *Import CSV*): download the template (`/api/benchmark-library/template`), upload, check the column mapping (aliases are recognised), preview every row with its errors, then import. Accepted rows go into the draft; rejected rows are listed; rows already in the dataset are skipped, never overwritten. Failed imports are logged too.
- **Matching** (`match.ts`): a record is eligible only if it's the same metric, the same unit and a compatible period basis (e.g. NRR must be annual or trailing 12 months; MoM growth monthly), from a published version of a non-archived dataset whose source isn't unreliable and allows customer display. Its cohort must not contradict the company (stage, ARR or revenue band, ACV, segment). Among eligible cohorts, specific and documented ones win (stage/ARR match, confirmed definition, sample size, cohort description, reliability; overdue review counts against). A match is *strong* only with a confirmed definition, an explicit stage or ARR match, no unknown company attributes, and a current, reliable source; otherwise *directional*. Other sources reporting the same metric are listed, never averaged. Advisors can override per company and metric on the company's Results step (a specific record or "don't benchmark"); overrides can't bypass unit or period-basis incompatibility.
- **Comparisons** (`compare.ts`): observed (the company's figure) vs benchmark (median, else the 50th percentile or mean, with all published percentiles), derived difference (points for percentages, unit and % otherwise, direction-aware), position among percentiles or within a range, and a fixed interpretation that says where the company sits, not why. No derived figures when the licence doesn't allow them. Limitations list the sample size, cohort caveats, review status and source notes.
- **In assessments**: `assembleAssessmentInputs` calls `benchmarkCompany`, gives the Draft Agent the comparisons (with record ids to cite) and the numbers they contain, and saves the comparisons into the brief's content with dataset version and record ids; `benchmark_usages` links the report to the records. Briefs render from that saved copy, so a later version never changes an existing report; `reproduceComparison` re-derives a saved comparison from its records. The founder's Results show each comparison labelled Observed / Benchmark / Derived / Interpretation with the source, cohort, period and limitations, plus the metrics with no relevant benchmark and why. The dataset page has a *Customer preview* that renders the same card.
- **Overview**: published datasets and metrics, sources, core metrics missing stage cohorts, records awaiting review, datasets due for review (per-source interval, default 365 days; old data is flagged, not rejected), drafts with validation errors, and the datasets most used in reports.

### Legacy cohort benchmarks

`/advisor/benchmarks` (advisors and admins) manages cohorts, their benchmark rows and sources (`lib/data/benchmarks.ts`, rules in `lib/benchmarks.ts`).

- **Cohorts**: name, criteria (stages, ARR range, business model, GTM motion), company count. The seeded sample cohort is read-only and never matched to real companies.
- **Rows** are `proposed`, `approved` or `retired`. Only approved rows may be used by agents or shown to founders. Approving needs a source and quartiles in a sensible order, and retires any other approved row for the same cohort, metric and period. Quartiles are direction-aware: `p75` is the *top quartile*, so for lower-is-better metrics (sales cycle, CAC payback, burn multiple) it's the smaller number.
- **CSV import** of the owner's advisory data: download the template from the page (`/advisor/benchmarks/template`), fill in `metric,p25,median,top_quartile,sample_size,period`, and import it with a source name. Rows arrive as proposed under one `advisory` source; bad rows are listed by line and skipped.
- This older cohort tool still feeds the Phase 1 Benchmark report and the `/sample` company; assessments no longer use it. It's linked from the Benchmark Library page.
- **Research public benchmarks** (`lib/ai/research.ts`) runs Claude with the web search tool after the action responds (`after()`, up to 300s), logged in `agent_runs` (`agent = research`). It returns aggregates and citations only. In code, any source whose URL wasn't among the search results is dropped, as are rows pointing at it and rows with quartiles out of order; what was dropped is shown on the page. Everything kept is proposed until an advisor approves it.

### Benchmark deliverable pipeline

`lib/data/deliverables.ts` runs a Benchmark end to end. It starts when a founder sends their data from Data Readiness, or when an advisor clicks Generate on `/advisor/review`. The work runs after the response (`after()`, up to 300s) and each agent call is logged in `agent_runs`.

1. **Inputs, in code**: the company's latest *accepted* data point per metric; the best-matching cohort among non-sample cohorts with *approved* rows (`lib/cohort-match.ts`, rule-based on stage, ARR band, GTM motion and business model); the comparison rows (company value, cohort median and top quartile, ahead/behind); open register items; and the advisor's feedback when sent back. The methodology text is generated from the match, not by the model.
2. **Draft Agent** (`lib/ai/draft.ts`) writes only the narrative (headline, insight, strengths, watch areas, priority, missing inputs) and cites the data point / benchmark row IDs it was given. Table rows and their claims are built in code.
3. **QA Agent** (`lib/ai/qa.ts`) is a separate call that sees the input and the draft output only, and returns the five checks. Code checks (`lib/deliverables/checks.ts`) then verify every figure in the text matches an input value or a simple gap, and every claim cites a valid source; a code failure overrides the model's pass.
4. **Advisor gate** (`/advisor/review/[id]`): draft preview, QA results and run details side by side. *Approve* → `approved`, then *Publish* → visible to the founder (and phase moves to `baseline`). *Request changes* edits the text into a new version that's QA'd again. *Send back to AI* redrafts with the advisor's comment. Older versions become `changes_requested`.

Founders see progress on `/processing` (status only, never draft content) and the latest *published* version on `/benchmark`. Runs that haven't finished in 10 minutes show as stalled and can be restarted. Events: `review_decision`, `deliverable_published`, `deliverable_viewed`, `source_trail_opened`.

### Pricing and the founder journey

Self-service model (owner decision, Oct 2026), replacing the $1 use case selection charge:

| Tier | Price | Status |
|---|---|---|
| Growth Snapshot | Free | Live: explore all six use cases, questionnaire, Snapshot |
| Single Assessment | $149 per use case (`ASSESSMENT_PRICE_CENTS`) | Live for all six (`SELLABLE_USE_CASES` can narrow it); self-service, generated by the assessment engine |
| Advisory Session | From $750 (`ADVISORY_PRICE_CENTS`) | Request form, or `ADVISORY_BOOKING_URL` when set; no payment taken in-app |
| Growth Intelligence | $299/month (`SUBSCRIPTION_PRICE_CENTS`) | Reserved in `lib/pricing.ts` only; not shown or sold, no recurring billing |

- **Journey**: Overview → Library (`/library`, six cards) → use case page (`/library/[useCase]`: who it's for, what you get, price, how it works, data needed, and the questionnaire) → free **Growth Snapshot** (`/library/[useCase]/snapshot`) → Stripe Checkout → Data (`/data`) → Results (`/baseline`) → optional advisory (`/advisory`). History at `/assessments`.
- **Questionnaire**: the challenge plus stage and sales model are required. Company-profile questions (stage, sales model, and a few figures per use case in `snapshotProfile`) are only asked when the profile lacks them, and save through the intake (`saveIntakeAnswer`), so they also become accepted data points.
- **Snapshot** (`lib/use-cases/snapshot.ts`): rule-based signals from the founder's own answers and simple arithmetic on them (e.g. NRR below 100%, hiring budget ÷ ACV, months to the target close), each with the answer it's based on, labelled as hypotheses. It never uses peer benchmarks. It also says whether another assessment fits better and which data would confirm it.
- **Purchase** (`lib/data/payments.ts`): `createAssessmentCheckout` checks the use case is sellable and not already owned, reuses an open Checkout for the same company and use case (stored `payments.checkout_url`, plus a Stripe idempotency key for double clicks), and records a pending payment. Access is granted only by `recordPaidSession`, from Stripe's signed webhook or a server-side retrieve on return (`/api/checkout/return`); unpaid, failed (`async_payment_failed`) and expired sessions are recorded and never unlock anything. Paid sessions from the retired $1 purchases still grant what they bought. The entitlement is `company_use_cases.activated_at` (`activation` = `paid` or `advisor`).
- **Assessment engine** (`lib/data/assessments.ts`, `lib/ai/assessment.ts`): one pipeline for all six use cases, producing a **Decision Brief**. "Analyze my data" on the Data step assembles, in code: the decision framework's brief (`ASSESSMENT_BRIEFS`), the founder's answers and target, their figures (latest per metric, each with origin, method, period and sample size), the tables computed from their files (`analysis:N`), approved peer reference rows from the best-matching cohort (with what it did and didn't match on), and a **rule-based diagnosis** (`lib/diagnostics/`): ranked candidate constraints, each with supporting, contradicting and context evidence (`ev:N`), ARR at stake where the arithmetic allows, and the fastest test, plus a certainty set by rule (established / leading / not yet established; never a percentage) and the unknowns that would most change it. The Draft Agent interprets that evidence (it never calculates) and writes the nine sections citing those ids; the QA Agent and the code checks (every number traceable to an input, every statement sourced) run next. It never leaves the founder without a brief: "Analyze" works with whatever has been shared; a draft that fails the code checks is revised once with the exact failures, then any statement still failing is dropped (`sanitizeAssessment`); if the model fails outright, a brief is built from the rule-based diagnosis and figures alone (`fallbackAssessment`, marked as partial); a QA Agent failure is recorded but doesn't block the result. Gaps found in code are always listed (`systemGaps`, `lib/deliverables/assessment-safety.ts`). Versions are deliverables of type `baseline` with `use_case`; the content (`lib/deliverables/assessment.ts`, `format: "brief"`) is structured and includes a snapshot of the baseline figures, so the next version shows what changed; briefs in the earlier format are read through `parseBrief`. Claims can cite a founder's answer (`founder_answer`) or a calculation (`analysis`). Advisors see the QA results on the company's Results step and can "Mark reviewed". Anything deeper is the paid advisory session.
- **Check your figures** (`lib/figures.ts`, `lib/data/figures.ts`, `components/use-cases/FigureChecker.tsx`), on the Data and Results steps: every figure the assessment uses (the use case's figures plus the founder's main metric), each value with its source (company profile, a filename, or entered by them) and a state (confirmed, values disagree, not confirmed, missing). "Use this one" accepts that value, sets differing values aside, updates the company profile answer to match, and closes open conflict/assumption questions about it; "Enter it" saves a missing or corrected figure (through the profile when it has a field). Unresolved disagreements are passed to the Draft Agent, listed as gaps, and keep the result from counting as complete.
- **Results** (`components/views/AssessmentResults.tsx`): the Decision Brief in nine sections, the same for every use case: (1) executive decision, with the diagnosis certainty; (2) where you are now: each figure with its period, whether it was calculated, reported or read from a document, the method, sample size, a flag when it's over 90 days old or unconfirmed, the previous brief's value (better/worse), and peer median/top quartile only when approved reference rows matched, with the source, year and any imperfect match explained; (3) diagnosis: the leading explanation, the others considered, the fastest test to tell them apart, and what isn't known yet; (4) evidence, each item labelled verified, calculated, inference or hypothesis and whether it points against the diagnosis, the calculation tables from their files, confidence in the inputs (`lib/use-cases/results.ts`), assumptions, data gaps and method; (5) options with upside, downside and implications; (6) recommendation and why; (7) a 30–90 day plan (priority, action, rationale, timing, who only when the evidence says, measure, the signal to look for labelled as proposed, dependencies and risks) with **Commit to this plan**; (8) what would change the recommendation; (9) follow-up metrics and a revisit date. Every statement opens its Source Trail. One advisor card at the end, never gating the results: with any gaps it offers a review with an executive-level advisor; when the data is complete it recommends a monthly executive advisor call. Both go to `ADVISORY_BOOKING_URL` (Calendly; the monthly one can use `ADVISORY_MONTHLY_BOOKING_URL`) through a tracked redirect, or to the request form when no link is set.
- **Progress** (`lib/data/plan.ts`, `/progress`): committing a brief saves its actions to `plan_actions` with the baseline value of each tracked metric and moves the use case to tracking, which unlocks step 5. Progress shows each action with a status (not started, in progress, done, dropped) and a note, the tracked metrics' latest confirmed or calculated value since the brief against baseline (improving / worse), figures that changed since the brief, the reassessment date (from the brief's follow-up), and "Reassess now"; when a newer brief exists it links to it. Re-running while tracking keeps Progress open. Advisors see it read-only on the company's step 5. There are no scheduled jobs or alerts yet: change detection happens when the founder opens Progress or re-runs.
- **Advisory**: `advisory_requests` (one open request per company and use case per week); advisors see them on the company's Overview.
- **Steps**: the founder sidebar (`components/shell/UseCaseSidebar.tsx`, `lib/use-cases/steps.ts`) shows Overview, Use Case Library, Data, Results, Progress & Tracking; Data and Results unlock with a purchased (or granted) assessment; Progress unlocks when the founder commits to a plan. The switcher picks which owned assessment steps 3–5 show (cookie `gg_use_case`, a preference only). Advisors see the same steps under `/advisor/companies/[id]` and can "Grant without payment" with a note.

### Benchmark pipeline (advisor reference)

The Phase 1 Benchmark (cohort comparison, `lib/data/deliverables.ts`, Review Queue) still runs for advisors and the public sample company. Founders no longer see Benchmarks; their results come from the assessment engine above.

### Advisor portfolio and company view

`/advisor/portfolio` shows counts (active, requiring attention, awaiting founder input, in advisor review, complete) and a table of the advisor's companies (admins: all) built from accepted data, open registers, readiness and the latest Benchmark version (`lib/data/portfolio.ts`). A company needs attention when a Benchmark is waiting for review or publishing, a run failed, data conflicts are open, or its health is "at risk".

`/advisor/companies/[id]` shows metrics, score, benchmark position (published, or the current draft), phase, readiness, open questions and files. Advisors set health, keep an internal advisor summary (never shown to founders), and review the founder's data items: **Validate** supplied items and send **follow-up requests**, which the founder sees on the item and in the "most useful next step".

### AI configuration checks

`lib/ai/config.ts` validates `ANTHROPIC_API_KEY` before use (trims whitespace; rejects keys with non-ASCII characters such as "…" from a shortened copy, a wrong prefix, or too short) without echoing the value. When the AI isn't usable, founders see "Automatic reading isn't available right now…" and still get column-match suggestions; advisors see the specific problem on failed runs. Admins can run **Check AI connection** (a free model lookup) under System checks on `/advisor/analytics`.

### Analytics

Events are recorded with `track()` (`lib/events.ts`): `intake_section_completed`, `document_uploaded`, `extraction_completed`, `register_item_resolved`, `review_decision`, `deliverable_published`, `deliverable_viewed`, `source_trail_opened`, `invite_sent`, `invite_accepted`. Admins see the derived metrics on `/advisor/analytics` (`lib/analytics.ts`, sample company excluded):

- **Activation**: companies with intake ≥80% and at least one document.
- **Sign-up to first Benchmark**: median hours from company creation to the first `deliverable_published`.
- **Source trails opened**: share of companies that viewed a Benchmark and opened a source trail.
- **Review turnaround**: median hours from QA complete to the advisor's decision.
- **Approved without changes**: published Benchmarks with no edit or send-back since the previous publish.
- Use case funnel: `library_viewed`, `use_case_viewed`, `objective_saved`, `checkout_started`, `use_case_activated` (all carry `use_case`).

### End-to-end tests

`npm run test:e2e` starts a throwaway local Postgres (`e2e/db.sh`, needs Postgres 16 binaries; set `PG_BIN` if they live elsewhere), applies the migrations and runs `next dev` in **test mode** (`E2E_AUTH=1`, `lib/e2e.ts`). Test mode signs users in from a `gg_e2e_user` cookie instead of Neon Auth and replaces model calls with deterministic stubs (`lib/ai/fake.ts`) and Stripe with a fake whose Checkout returns straight to the success URL as paid. It only switches on under `next dev`, outside Vercel, with the variable set explicitly, so it can't be active on a deployment (covered by `tests/permissions.test.ts`).

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
