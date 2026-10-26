# HANDOFF.md — Growth Goaled v1

> **For Claude Code.** This file is the single source of truth for building Growth Goaled. Read all of it before writing code. Build Phase 1 milestone by milestone; stop at the end of each milestone, summarise what was built, and wait for the owner to confirm before starting the next. When this file and the prototype disagree, this file wins. When something is ambiguous, ask instead of guessing.
>
> **Status (Oct 26, 2026): Phase 1 is complete. Next is Phase 1.5 — the Use Case Library in §13, which overrides earlier sections where they conflict. Start at U1.**

---

## 0. Owner setup checklist (humans do these, not Claude Code)

- [x] GitHub repo `growth-goaled` created (private), this file committed at the root.
- [x] Prototype core files in `/prototype` (tokens, Layout, mock data). Claude Code pulls the remaining view files at the start of M1 — see `prototype/README.md`. Reference only — not deployed.
- [x] Vercel project `growth-goaled` (`prj_eBPPjZ3YjzhXtF7kp38mCPIYtFfY`) linked to the repo; framework Next.js; functions region `iad1`.
- [x] Neon wired to Vercel by env vars (no marketplace integration): Production → Neon `main`; Preview and Development → Neon `dev`. `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, for migrations) set; `APP_URL` set per environment.
- [ ] `ANTHROPIC_API_KEY` from the Anthropic Console added in Vercel for Production and Preview.
- [x] Private Vercel Blob store `growth-goaled-uploads` (iad1) connected; `BLOB_READ_WRITE_TOKEN` set for all environments.
- [x] DNS for growthgoaled.com: CNAME `app` and `dev` → `cname.vercel-dns.com`. Domains already added in Vercel (`dev` domain bound to the `dev` branch). `www` is untouched.

---

## 1. Product in one paragraph

Growth Goaled is a Growth Intelligence platform for B2B SaaS and AI companies from late seed through Series A (~$1M–$10M ARR). A founder picks the decision they face from a **use case library** (§13), shares the data that use case needs, and the system extracts structured metrics, computes the figures in code, and produces an analysis — using approved reference (benchmark) data as a comparison line where it exists. Each deliverable is drafted by a Draft Agent, checked by an independent QA Agent, and approved by a human advisor before the founder sees it. Every claim links to its sources.

Promise: **Know where you stand. Know what to fix. Know what comes next.**

---

## 2. Users and permissions

| Role | Can see | Can do |
|---|---|---|
| `founder` | Only their own company | Intake, upload, resolve register items, read **published** deliverables, open source trails |
| `advisor` | Companies assigned to them + unassigned queue | Everything founders can, plus: read drafts, run/re-run agents, approve / request changes / send back, invite founders, build score rubrics, manage benchmark data |
| `admin` | Everything | Everything advisors can, plus: user management, assign companies to advisors |

Enforce permissions **on the server** (route handlers / server actions / data-access layer), never only in the UI. Every query that returns company data must filter by the caller's access. Write a test for each role that proves a founder cannot read another company's data and cannot read unpublished deliverables.

### Signup paths
1. **Self-signup (founder):** sign up → create company → company is `unassigned` → appears in advisor/admin "Unassigned" list → an advisor claims it.
2. **Advisor invite:** advisor enters founder email + company name → `invites` row with single-use token (expires 14 days) → email with link → founder signs up and is attached to that company, already assigned to the inviting advisor.

---

## 3. Tech stack (fixed — do not substitute without asking)

- **Next.js** (latest stable, App Router, TypeScript strict, Server Components by default)
- **Tailwind CSS 4**, design tokens below as CSS variables
- **Recharts** for charts
- **Neon Postgres** + **Drizzle ORM** + drizzle-kit migrations (migrations committed to repo)
- **Auth:** Neon Auth (Better Auth). Email magic link first; Google sign-in later. Role stored on our `users` table.
- **Storage:** Vercel Blob (private) for uploaded documents
- **AI:** Anthropic Claude API via `@anthropic-ai/sdk`, server-side only. Use the current recommended Claude model; keep the model name in one config constant.
- **Validation:** Zod for all inputs and for every AI JSON output
- **Email:** Resend (or ask owner) for invites and reminders
- **Testing:** Vitest for logic, Playwright for the key flows
- **Hosting:** Vercel

---

## 4. Environments

| | Production | Staging |
|---|---|---|
| Git branch | `main` | `dev` |
| URL | https://app.growthgoaled.com | https://dev.growthgoaled.com |
| Vercel env | Production | Preview (domain assigned to `dev` branch) |
| Database | Neon project `growth-goaled` (`young-poetry-10785743`, aws-us-east-1, db `growth_goaled`), branch `main` | Same project, branch `dev` (`br-still-firefly-b7418xev`) |
| Seed data | Acme AI sample company only | Acme AI + full fake portfolio (7 companies) + test users for each role |

**Workflow:** all work happens on `dev` (or feature branches merged into `dev`). Check it on dev.growthgoaled.com. Merge `dev` → `main` to release. Never commit directly to `main`.

Migrations run automatically on deploy for the matching database (`drizzle-kit migrate` in the build step, using the unpooled URL). Seed scripts never run against production except the Acme AI sample.

Required env vars (document them in `.env.example`, never commit real values):
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, auth secrets as Neon Auth requires, `RESEND_API_KEY`, `APP_URL`.

Add a small visible "STAGING" badge in the top bar when `APP_URL` is the dev domain.

---

## 5. Design system

Port the look exactly from `/prototype` (`src/index.css`, `src/components/Layout.tsx`, `src/views/**`).

- Fonts: **Instrument Serif** (display headlines), **Inter** (UI), **JetBrains Mono** (numbers, labels)
- Tokens: `--background #F7F8FA` · `--foreground/--navy #0D1B2A` · `--navy-light #152638` · `--card #FFFFFF` · `--primary/--green #155A3C` · `--green-light #1A7049` · `--green-muted #EBF5EF` · `--amber #D97706` · `--amber-muted #FEF3C7` · `--red #DC2626` · `--red-muted #FEE2E2` · `--blue #1D4ED8` · `--blue-muted #EFF6FF` · `--secondary #EEF2F7` · `--muted #F1F5F9` · `--muted-foreground #64748B` · `--border #E2E8F0` · `--radius 8px`
- Light, premium, generous whitespace, minimal shadows, subtle 200ms page transitions. No glowing/sci-fi AI imagery.
- Copy: say **"Growth Intelligence Analysis"**, never "AI generated this".
- Desktop-first (≥1280px); must not break on tablet. Mobile is out of scope.

**Porting rule:** the prototype is a single-page state machine with hard-coded mock data. Convert each view into a real route, replace mock data with database reads, and keep the markup/styling. Extract shared pieces (MetricCard, StatusPill, SourceTrailPanel, PageHeader, etc.) into `components/`.

---

## 6. Routes

Founder (`/app/...` layout with founder sidebar + progress indicator):
`/welcome` · `/intake/[section]` · `/upload` · `/processing` · `/dashboard` · `/benchmark` · `/baseline` · `/icp` · `/channels` · `/hiring` · `/questions` · `/deliverables`

Advisor (`/advisor/...` layout with advisor sidebar):
`/advisor/portfolio` · `/advisor/unassigned` · `/advisor/companies/[id]` · `/advisor/review` · `/advisor/review/[deliverableId]` · `/advisor/benchmarks` · `/advisor/rubrics` · `/advisor/registers` · `/advisor/settings`

Shared: `/sign-in`, `/sign-up`, `/invite/[token]`, `/sample` (read-only Acme AI demo, no login), Source Trail as a side panel component available on every deliverable page.

Advisors viewing a company see founder pages for that company with an advisor banner and access to drafts.

---

## 7. Data model (Drizzle)

All tables: `id` (uuid), `created_at`, `updated_at`. Company-owned tables carry `company_id` and are always filtered by access.

- **users** — email, name, role (`founder|advisor|admin`), auth_user_id
- **companies** — name, website, industry, stage, arr, growth_pct, funding, employees, customers, acv, nrr, grr, sales_cycle_days, primary_segment, sales_model, founder_led (bool), phase (enum: intake, upload, benchmark, baseline, icp, channels, hiring, complete), health (`good|watch|critical`), advisor_id (nullable → unassigned), is_sample (bool)
- **company_members** — company_id, user_id, member_role (`owner|member`)
- **invites** — email, company_id, invited_by, token_hash, expires_at, accepted_at
- **intake_responses** — company_id, section (`company|customers|gtm|icp|hiring`), field, value (jsonb), source (`manual|extracted`), data_point_id (nullable). Unique (company_id, section, field). % complete = answered required fields / required fields (define required fields in one config file).
- **documents** — company_id, doc_type (`board_deck|financial_model|customer_list|gtm_plan|sales_deck|hiring_plan|other`), blob_url, filename, mime, size, status (`uploaded|analyzing|done|failed`), error, uploaded_by, data_points_found, assumptions_flagged
- **data_points** — company_id, metric (key from a fixed metrics dictionary), value (numeric) + unit, raw_text, period, document_id (nullable), page, confidence (`high|medium|low`), status (`proposed|accepted|rejected`), accepted_by
- **register_items** — company_id, type (`missing|question|conflict|assumption|follow_up`), title, description, data_point_ids (uuid[]), status (`open|resolved|unknown`), resolution (jsonb), owner (`founder|advisor`), remind_at
- **benchmark_sources** — name, publisher, url, year, type (`public|advisory`), licence_note, imported_by, notes
- **benchmark_cohorts** — name, criteria (jsonb: stage[], arr_min, arr_max, model, gtm_motion), description, company_count
- **benchmark_metrics** — cohort_id, metric, p25, median, p75 (top quartile), sample_size, source_id, period/year, status (`proposed|approved|retired`), approved_by. **Only `approved` rows may be used by agents.**
- **score_rubrics** — advisor_id, name, is_default, criteria (jsonb: [{metric, weight, bands:[{min,max,points}]}]), labels (jsonb: [{min,max,label}])
- **company_scores** — company_id, rubric_id, computed_score, breakdown (jsonb), override_score, override_note, computed_at
- **deliverables** — company_id, type (`benchmark|baseline|icp|channels|hiring`), version (int), status (`drafting|qa|in_review|changes_requested|approved|published|failed`), content (jsonb, validated by per-type Zod schema), headline, created_by_run
- **claims** — deliverable_id, claim_key (stable id used in content JSON), text, confidence
- **claim_sources** — claim_id, kind (`data_point|benchmark_metric|document|methodology`), ref_id, note
- **agent_runs** — deliverable_id, agent (`draft|qa|extract`), model, status, input_hash, output (jsonb), tokens_in, tokens_out, error, duration_ms
- **reviews** — deliverable_id, version, qa_results (jsonb: 5 checks pass/fail/note), decision (`approve|request_changes|send_back`), comment, reviewer_id
- **events** — user_id, company_id, name, props (jsonb)

Metrics dictionary (`lib/metrics.ts`): arr, arr_growth, nrr, grr, acv, sales_cycle_days, ae_productivity, cac_payback_months, win_rate, customers, employees, sales_reps, sdrs, magic_number, burn_multiple — each with unit, display format, and whether lower is better.

---

## 8. Intelligence pipeline

All AI calls live in `lib/ai/`, run server-side, are logged to `agent_runs`, and return JSON validated with Zod (retry once on validation failure, then mark `failed` and surface it to the advisor). Long work runs in background functions so requests don't time out; the UI polls status.

### 8.1 Document extraction
Upload → Blob → `documents.status = analyzing` → send the document to Claude (PDF/document support; spreadsheets converted to CSV text first) with the metrics dictionary → returns `[{metric, value, unit, period, page, raw_text, confidence}]` → insert as `proposed` data_points.
Then compare against intake answers and other data points: if the same metric/period differs by >10%, create a `conflict` register item. Low-confidence or inferred values create `assumption` items. Update `data_points_found` / `assumptions_flagged` (these drive the "47 data points identified / 6 assumptions require review" UI).

### 8.2 Draft Agent
Input: company profile, **accepted** data points, the matched cohort's **approved** benchmark metrics (with sources), open register items, deliverable type. Output: the deliverable's content JSON where every finding references `claim_key`s, plus a `claims` array with `sources` pointing at the IDs it was given. Instruct the model to use only the provided numbers, never invent figures, and to list missing inputs instead of guessing.

### 8.3 QA Agent
Separate call, separate prompt. Sees the input data and the draft output only — never the Draft Agent's reasoning. Returns the five checks: **data consistency, benchmark methodology, source trail, recommendation logic, missing inputs** — each `pass|fail` with a note. Also verify in code (not just by model) that every number in the draft matches an input value and every claim has ≥1 source.

### 8.4 Advisor gate
Deliverable goes to `in_review` after QA. Advisor sees draft + QA results side by side and chooses: **Approve** (→ `approved`, then Publish → visible to founder), **Request Changes** (advisor edits text/fields directly; new version), **Send Back to AI** (comment fed to a new Draft run). Founders only ever see `published` versions.

### 8.5 Benchmark research (advisor tool)
On `/advisor/benchmarks`, "Research public benchmarks" runs Claude with web search to find published SaaS benchmark data for a cohort's criteria. Results come back as **proposed** benchmark_metrics with a benchmark_source (publisher, URL, year, sample size). Store aggregates and citations only — no copied report text. The advisor reviews and approves each row. Also provide **CSV import** for the owner's advisory data (template downloadable from the page), imported as `advisory` source rows, also `proposed` until approved.

### 8.6 Cohort matching
Rule-based in code, not AI: pick the approved cohort whose criteria best match stage, ARR band, model and GTM motion; show the criteria on the Benchmark page.

### 8.7 Growth Intelligence Score
Computed in code from the advisor's rubric (weighted bands → 0–100) and the company's accepted metrics; label from rubric ranges. Advisor may override with a note. Show breakdown in the source trail.

---

## 9. Build plan

### Phase 1 — first deploy (milestones in order)

**M1 · Foundation.** Next.js app, Tailwind tokens + fonts, layouts (founder + advisor sidebars from prototype), Drizzle schema + first migration, Neon Auth with magic link, roles, `dev`/`main` environments working, STAGING badge, `.env.example`, README.
*Done when:* sign-in works on dev.growthgoaled.com, a founder and an advisor see different sidebars, migrations run on deploy.

**M2 · Seed + sample.** Seed Acme AI (all prototype numbers from `/prototype/src/data/mock.ts`) with a published Benchmark deliverable, plus the fake portfolio on staging. `/sample` read-only demo.
*Done when:* the sample walkthrough looks like the prototype, backed by the database.

**M3 · Signup, invites, assignment.** Self-signup → company creation → unassigned queue; advisor invite flow with email; advisor claims company.

**M4 · Intake.** Five sections, autosave on blur, % complete, resume later, phase advances.

**M5 · Upload + extraction.** Upload to Blob, extraction pipeline, data points review list (accept/reject), automatic register items.

**M6 · Questions / registers.** Founder Questions page (Resolve / Mark unknown / Use uploaded data), registers view, advisor registers.

**M7 · Benchmark data.** Advisor benchmarks page: cohorts, CSV import, public research run, approve/retire rows, sources list.

**M8 · Benchmark deliverable end-to-end.** Processing screen tied to real job status → Draft Agent → QA Agent → Review Queue (approve / request changes / send back) → publish → founder Benchmark page with Source Trail panel.

**M9 · Advisor portfolio + company view.** Counts and table from real data, company view with phase, benchmark position, open questions, advisor summary.

**M10 · Analytics + hardening.** Events for the metrics below, permission tests per role, Playwright run of: signup → intake → upload → (advisor) approve benchmark → founder sees it.

### Phase 2
Baseline, ICP, Channel Strategy, Hiring Plan deliverables (same Draft → QA → review pipeline); score rubrics + dashboard score; reminders (email); Deliverables page; Google Drive import.

### Phase 3
Methodology / Data Quality screens, Compounding Intelligence page, billing, Google sign-in.

---

## 10. Metrics to instrument (events)

`intake_section_completed`, `document_uploaded`, `extraction_completed`, `register_item_resolved`, `deliverable_published`, `deliverable_viewed`, `source_trail_opened`, `review_decision`, `invite_sent`, `invite_accepted`.
Derived: activation (intake ≥80% + ≥1 doc), hours from signup to first published Benchmark, % source trails opened, review turnaround, % approved without changes, pilot → paid.

---

## 11. Non-negotiables

- One company's raw data is never visible to another customer. Benchmarks use aggregates only.
- Nothing unpublished reaches a founder. Nothing unapproved feeds an agent.
- No invented numbers: every figure shown traces to a data point or approved benchmark row.
- API keys stay server-side. Uploaded files are private (signed/short-lived access only).
- Don't build yet: mobile, payments, CRM integrations, social login, public marketing site.

## 12. Working agreement

- Small commits with clear messages; push to `dev`; let Vercel deploy; verify on dev.growthgoaled.com.
- Keep `README.md` current: local setup, env vars, how to run migrations/seeds/tests.
- At the end of each milestone: summarise what changed, what's left, any decisions you made, and anything the owner must do in Vercel/Neon/DNS.

---

## 13. Phase 1.5 — Use Case Library (added Oct 26, 2026)

> **This section overrides §1, §6, §8 and §9 wherever they conflict.** Phase 1 (M1–M10, plus Data Readiness and the $1 preliminary unlock) is done. Build this next, milestone by milestone (U1–U6), stopping after each for owner review on dev.growthgoaled.com — same working agreement as §12. Product reasoning is in `docs/spec.md` (v2).

### 13.1 Why
Benchmark against peer cohorts is weak while the database is young. The product now leads with a **library of use cases**: each answers one founder decision from the company's own data. Benchmark data is kept and renamed **Reference data**; it appears inside use cases as a reference line where approved rows exist. Every use case must still produce a useful, honest answer with **zero** matching reference rows (fall back to the company's own trend and the advisor's rubric, and say plainly that no peer reference is available yet).

### 13.2 The six use cases

Ids are stable keys used in code, URLs, DB rows and events.

| id | Founder's question | Data items needed (keys in `lib/readiness.ts`; **bold** = required to build) | Figures computed in code | Reference data used if available | Output (content JSON) |
|---|---|---|---|---|---|
| `growth_leak` | Where is our growth leaking? | **monthly_revenue**, **revenue_by_customer**, **churned_revenue**, renewals_expansions, grr_nrr, opportunities, stage_conversion, win_loss, leads_by_source | ARR, ARR growth, new / expansion / churned ARR (ARR bridge), NRR, GRR, win rate, stage conversions, sales cycle | Approved rows for the same metrics; advisor rubric for `growth_leak` | `bridge` (periods × new/expansion/churn), `funnel`, `constraint` (pipeline \| conversion \| retention \| expansion, with evidence), `findings[]`, `next_use_case` (one of the other ids + why), `missing_inputs[]` |
| `series_a_ready` | Are we ready to raise a Series A? | **monthly_revenue**, **monthly_burn**, **cash_balances**, **customer_list**, **revenue_by_customer**, gross_margin, runway, grr_nrr, churn, active_usage, opportunities, win_loss | ARR, MoM and YoY growth, recurring share of revenue, gross margin, burn multiple, runway months, NRR/GRR, top-customer concentration (top 1 / top 10 share), customer count | Approved Series A bars (stage = Seed→A) from Reference data, each cited; advisor rubric for `series_a_ready` | `areas[]` (growth, retention, revenue quality, efficiency, GTM repeatability, runway & timing — each `ready \| close \| not_yet` with evidence), `investor_questions[]`, `plan_90_day[]`, `timing` (recommended raise window vs runway), `missing_inputs[]` |
| `series_b_ready` | Are we ready to raise a Series B? | **monthly_revenue**, **monthly_burn**, **cash_balances**, **grr_nrr**, gross_margin, runway, marketing_spend, cpl_cac, roster, sales_capacity, forecast_vs_actual | ARR, YoY growth, NRR, GRR, gross margin, burn multiple, CAC payback, magic number, AE productivity, forecast accuracy, runway months | Approved Series B bars (stage = A→B), cited; advisor rubric for `series_b_ready` | Same shape as `series_a_ready` (areas: growth, net retention, efficiency, GTM repeatability, team & forecastability, runway & timing) |
| `hire_or_fix` | Should we hire more salespeople, or fix what we have first? | **roster**, **sales_capacity**, **opportunities**, **win_loss**, targets, opp_value_dates, sales_cycle, compensation, hiring_dates_comp, open_roles | AE productivity, quota attainment, ramp months, pipeline coverage, win rate, sales cycle, AE / SDR counts, CAC payback | Approved rows for those metrics; advisor rubric for `hire_or_fix` | `verdict` (hire_now \| fix_first \| hire_after_fixes), `diagnosis[]`, `hires[]` (role, why, quarter), `fixes[]`, `timeline`, `missing_inputs[]` |
| `winning_icp` | Who are we actually winning with? | **customer_list**, **revenue_by_customer**, **industry**, **company_size**, contract_metrics, use_case, start_term, status_renewal, win_loss, opp_value_dates | Per segment: customers, win rate, ACV, sales cycle, GRR/NRR, expansion; fit score from the rubric | Advisor rubric for `winning_icp` (fit weights) | `segments[]` (metrics + fit score), `primary_icp` (definition), `recommendation`, `deprioritise[]`, `missing_inputs[]` |
| `founder_handoff` | Is our sales repeatable without the founder? | **opportunities** (must include deal owner), **win_loss**, **founder_dependencies**, stage_history, sales_activity, roster, org_chart, deal_terms | Founder-sourced and founder-closed share of deals and ARR, win rate and cycle by owner (founder vs reps), stage conversion by owner | Advisor rubric for `founder_handoff` | `readiness` (score + label), `gaps[]` (process not written down, founder-only stages, etc.), `first_hire` (first AE \| sales leader + timing), `plan[]`, `missing_inputs[]` |

**Library order and recommendation:** show all six cards. Recommend `series_a_ready` + `growth_leak` when stage is pre-Series A or ARR band is `lt_1m`/`1m_3m`; otherwise recommend `growth_leak`. A founder may start several.

**Fundraise bars (#2/#3):** never hard-code thresholds. They come from approved Reference data rows tagged with the target stage, plus the advisor's rubric. Extend `research.ts` so the advisor can run "Research published Series A / Series B bars", producing **proposed** cited rows to approve — same rules as §8.5.

### 13.3 Architecture

- **Registry:** `lib/use-cases/` with one module per use case exporting a definition: `id`, `title` (founder question), `shortTitle`, `trigger`, `requiredItems` / `helpfulItems` (readiness keys), `computeFigures(company) → { figures, sourceIds }` (pure code, unit-tested), optional `referenceMetrics`, `contentSchema` (Zod), `draftBrief` (use-case-specific part of the Draft prompt), `qaBrief`, and the founder page component. Add the new metrics to `lib/metrics.ts`.
- **Readiness per use case:** compute from `data_items` status against `requiredItems` (code, no AI). A use case can build when every required item is `available` or `partial`; show what's missing using each item's existing `followUp` text.
- **Database (one migration):**
  - `use_case` text column on `deliverables` (nullable for legacy rows; existing `benchmark` rows stay readable as history). New deliverables set `type` to a new enum value `use_case`, or drop the enum dependency — your call, keep it simple.
  - `company_use_cases` (company_id, use_case, status: `not_started|collecting|building|in_review|published`, started_by, started_at; unique company+use_case).
  - `use_case` column on `payments` and on `score_rubrics`.
  - Replace `companies.benchmark_unlocked_at` with per-use-case unlock state (on `company_use_cases`, e.g. `unlocked_at`). Migrate existing values to `growth_leak`.
  - `companies.phase`: reduce to a coarse lifecycle (onboarding → active → complete) or derive it; the per-step phases no longer drive the sidebar. Review `lib/phases.ts`.
- **Pipeline:** generalise `lib/ai/draft.ts` and `lib/ai/qa.ts` into one Draft Agent and one QA Agent that take a use case definition (shared rules + `draftBrief`/`qaBrief`). Rename the QA check `benchmark_methodology` → `method` ("reference data and rubric used correctly"). Generalise `lib/deliverables/checks.ts` `allowedNumbers` to accept the use case's computed figures (plus gaps vs reference rows). Preliminary versions, supersession, throttling and code-check gating keep working as today, per use case.
- **Stripe:** `$1` unlock becomes per company **per use case**. Checkout success/cancel URLs point at the use case page. Event `use_case_unlocked` with `use_case` prop (keep `benchmark_unlocked` history).
- **Analytics events (add):** `use_case_viewed`, `use_case_started`, `use_case_data_ready`, `use_case_built` (preliminary / approved), `use_case_unlocked`, `next_use_case_clicked`. All carry `use_case`.

### 13.4 Routes and navigation

Founder:
- `/decisions` — "What are you trying to decide?" library (six cards: question, trigger line, data-ready %, status, recommended badge).
- `/decisions/[useCase]` — data checklist for this use case (reuse Data Readiness components scoped to its items) → build → preliminary (locked/unlocked) → published analysis with Source Trail.
- Sidebar: Overview · Company Profile · **Decisions** (expands to the use cases the company has started) · Data Readiness · Questions · Deliverables. Remove Benchmark, Baseline, ICP, Channel Strategy, Hiring Plan from the founder sidebar. Redirect `/benchmark`, `/baseline`, `/icp`, `/channels`, `/hiring` to the matching use case (`/benchmark` and `/baseline` → `growth_leak`, `/icp` → `winning_icp`, `/hiring` → `hire_or_fix`, `/channels` → `growth_leak`).
- Dashboard: replace benchmark-centric cards with "Your decisions" (status per started use case) and the recommended next use case.

Advisor:
- Rename **Benchmarks** → **Reference data** (same pages; add a stage tag for fundraise bars).
- Score Rubrics: pick the use case a rubric belongs to; seed a default rubric per use case (marked as editable defaults, no invented thresholds — leave threshold bands empty for the advisor to fill, except where an approved reference row can prefill them).
- Company view and Review Queue: show use case name and status; filter by use case.

Sample (`/sample`): rebuild around Acme AI's **Where is our growth leaking?** analysis (its prototype story — "a sales efficiency problem, not a pipeline problem" — is exactly a `growth_leak` result), with `hire_or_fix` as the recommended next use case.

### 13.5 Milestones

**U1 · Framework + library.** Registry with all six definitions (titles, triggers, required items; compute/draft can be stubs), `/decisions` library, `/decisions/[useCase]` data checklist with readiness %, `company_use_cases` + migration, new sidebar, redirects, dashboard "Your decisions".
*Done when:* a founder sees six cards with correct readiness %, can start one, sees only that use case's data checklist, and old routes redirect.

**U2 · Pipeline generalised + `growth_leak` end to end.** Shared Draft/QA agents, code checks on computed figures, per-use-case preliminary + $1 unlock, review queue per use case, Source Trail, founder page for `growth_leak`, `/sample` rebuilt.
*Done when:* upload → preliminary (unlock) → advisor approves → founder sees the published Growth Leak analysis, and it works with zero reference rows.

**U3 · Fundraise readiness (`series_a_ready`, `series_b_ready`).** Shared engine, stage-tagged reference rows, "Research published bars" advisor tool, per-stage rubrics, founder page (areas, investor questions, 90-day plan, timing).
*Done when:* a seed test company gets a Series A readiness analysis with every bar cited or explicitly marked "advisor rubric".

**U4 · `hire_or_fix`.**  **U5 · `winning_icp`.**  **U6 · `founder_handoff`** (add "deal owner" as an expected column for `opportunities` in `lib/readiness.ts`).
*Each done when:* end to end as in U2, with unit tests for `computeFigures` and an e2e path.

After U6: update `docs/TESTING.md`, README and the permission/e2e suites; retire dead Benchmark-only code paths (keep Reference data).

### 13.6 Owner decisions still open (ask before building the affected part)
- Unlock price and scope: $1 per use case (default) vs one unlock for all use cases.
- Whether advisors can hide a use case per company (default: no).
