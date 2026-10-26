# HANDOFF.md — Growth Goaled v1

> **For Claude Code.** This file is the single source of truth for building Growth Goaled. Read all of it before writing code. Build Phase 1 milestone by milestone; stop at the end of each milestone, summarise what was built, and wait for the owner to confirm before starting the next. When this file and the prototype disagree, this file wins. When something is ambiguous, ask instead of guessing.
>
> **Status (Oct 26, 2026): Phase 1 is complete. Next is Phase 1.5 — the Use Case Library in §13 (rev. 2: five-step flow), which overrides earlier sections where they conflict. Start at U1.**

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

## 13. Phase 1.5 — Use Case Library (rev. 2, Oct 26, 2026)

> **This section overrides §1, §6, §8 and §9 wherever they conflict.** Phase 1 (M1–M10, plus Data Readiness and the $1 preliminary unlock) is done. Build this next, milestone by milestone (U1–U7), stopping after each for owner review on dev.growthgoaled.com — same working agreement as §12. Product reasoning is in `docs/spec.md` (v2). Rev. 2 replaces the earlier rev. 1 of this section (owner's five-step flow).

### 13.1 Why
Benchmark against peer cohorts is weak while the database is young. The product now leads with a **library of use cases**: each answers one founder objective from the company's own data, and then tracks progress toward it. Benchmark data is kept and renamed **Reference data**; it appears inside a use case as a comparison line where approved rows exist. Every use case must still produce a useful, honest answer with **zero** matching reference rows (fall back to the company's own trend and the advisor's rubric, and say plainly that no peer reference is available yet).

### 13.2 The founder flow — five steps

Sign-up and sign-in (magic link, invites, unassigned queue) are **unchanged**.

The founder sidebar shows exactly five steps, in this order. Steps 3–5 are scoped to the **active use case** (see 13.5).

| # | Sidebar label | Route | Purpose |
|---|---|---|---|
| 1 | **Overview** | `/overview` (the post-sign-in landing; `/dashboard` redirects here) | A simple visual of how Growth Goaled works: **Pick a use case → Connect the relevant data → Receive an advisor-approved baseline and plan → Track your progress.** Four connected steps, one line each, with the founder's current position highlighted and one primary button for their next action. No metrics tables. |
| 2 | **Use Case Library** | `/library`, `/library/[useCase]` | Browse the six use cases (cards: the founder's question, when it's useful, what you get). Choosing one opens the **objective form** (13.4) to capture the nuance of what they're trying to achieve. Submitting the form leads to **Stripe Checkout** for that use case (13.6). Payment activates the use case and unlocks steps 3–5 for it. |
| 3 | **Data** | `/data` | The data needed for the active use case, **prioritised**: first the items required to establish the baseline, then items that sharpen it, then optional extras — each with why it matters for *this* objective. Reuses Data Readiness (drop zone, Google links, sorting, checklist, statuses) scoped to the use case's items. Open conflicts and questions from extraction appear here under "Needs your answer" (the old Questions page folds in). A "Baseline readiness" meter shows when enough is in to build. |
| 4 | **Baseline** | `/baseline` | The company's starting point against its objective: where each key metric stands today, the gap to the founder's target, the main constraint, and the **plan** (actions + KPIs to track). Built by the Draft Agent → QA Agent → advisor review pipeline; founders see only the advisor-approved version. Source Trail on every claim. Version history (the old Deliverables page folds in). |
| 5 | **Progress & Tracking** | `/progress` | Ongoing monitoring toward the objective: each tracked KPI from baseline → latest → target with an on-track / at-risk / off-track status; the plan's actions with owner, due date and status; monthly check-ins (founder update + advisor note); a re-baseline option when the objective or data changes materially. |

Locked steps (before a use case is activated, or before a baseline is approved) are visible but greyed, with one line saying what unlocks them.

Company profile moves to the profile menu (top right) and is pre-filled from sign-up and the objective form; its remaining fields are optional. Remove Benchmark, Baseline (old), ICP, Channel Strategy, Hiring Plan, Questions, Deliverables and Company Profile from the founder sidebar. Redirect old routes: `/dashboard` → `/overview`; `/readiness`, `/upload`, `/questions` → `/data`; `/benchmark`, `/icp`, `/channels`, `/hiring`, `/deliverables` → `/baseline` (or `/library` if no active use case); `/intake/*` → profile.

### 13.3 The six use cases

Ids are stable keys used in code, URLs, DB rows and events.

| id | Founder's question | Data items (keys in `lib/readiness.ts`; **bold** = required for baseline) | Figures computed in code | Reference data if available | Baseline content |
|---|---|---|---|---|---|
| `growth_leak` | Where is our growth leaking? | **monthly_revenue**, **revenue_by_customer**, **churned_revenue**, renewals_expansions, grr_nrr, opportunities, stage_conversion, win_loss, leads_by_source | ARR, ARR growth, new / expansion / churned ARR (ARR bridge), NRR, GRR, win rate, stage conversions, sales cycle | Approved rows for those metrics; advisor rubric for `growth_leak` | ARR bridge, funnel, main constraint (pipeline \| conversion \| retention \| expansion) with evidence, findings, plan, suggested next use case |
| `series_a_ready` | Are we ready to raise a Series A? | **monthly_revenue**, **monthly_burn**, **cash_balances**, **customer_list**, **revenue_by_customer**, gross_margin, runway, grr_nrr, churn, active_usage, opportunities, win_loss | ARR, MoM and YoY growth, recurring share, gross margin, burn multiple, runway months, NRR/GRR, top-customer concentration (top 1 / top 10), customer count | Approved Series A bars (stage-tagged, cited); advisor rubric for `series_a_ready` | Readiness by area (growth, retention, revenue quality, efficiency, GTM repeatability, runway & timing: ready \| close \| not yet), investor questions, plan to close gaps, raise timing vs runway |
| `series_b_ready` | Are we ready to raise a Series B? | **monthly_revenue**, **monthly_burn**, **cash_balances**, **grr_nrr**, gross_margin, runway, marketing_spend, cpl_cac, roster, sales_capacity, forecast_vs_actual | ARR, YoY growth, NRR, GRR, gross margin, burn multiple, CAC payback, magic number, AE productivity, forecast accuracy, runway months | Approved Series B bars (stage-tagged, cited); advisor rubric for `series_b_ready` | Same shape as Series A (areas: growth, net retention, efficiency, GTM repeatability, team & forecastability, runway & timing) |
| `hire_or_fix` | Should we hire more salespeople, or fix what we have first? | **roster**, **sales_capacity**, **opportunities**, **win_loss**, targets, opp_value_dates, sales_cycle, compensation, hiring_dates_comp, open_roles | AE productivity, quota attainment, ramp months, pipeline coverage, win rate, sales cycle, AE / SDR counts, CAC payback | Approved rows for those metrics; advisor rubric for `hire_or_fix` | Verdict (hire now \| fix first \| hire after fixes), diagnosis, hires (role, why, quarter), fixes, plan |
| `winning_icp` | Who are we actually winning with? | **customer_list**, **revenue_by_customer**, **industry**, **company_size**, contract_metrics, use_case, start_term, status_renewal, win_loss, opp_value_dates | Per segment: customers, win rate, ACV, sales cycle, GRR/NRR, expansion; fit score from rubric | Advisor rubric for `winning_icp` (fit weights) | Segments with metrics and fit, primary ICP definition, what to deprioritise, plan |
| `founder_handoff` | Is our sales repeatable without the founder? | **opportunities** (must include deal owner), **win_loss**, **founder_dependencies**, stage_history, sales_activity, roster, org_chart, deal_terms | Founder-sourced and founder-closed share of deals and ARR, win rate and cycle by owner (founder vs reps), stage conversion by owner | Advisor rubric for `founder_handoff` | Handoff readiness score + label, gaps (undocumented process, founder-only stages…), first hire (first AE \| sales leader + timing), plan |

Every baseline also contains, in a shared shape: `objective` (restated from the form), `kpis[]` (metric, baseline value + data point id, target value + date — target from the founder's form, adjusted only with an advisor note), `plan[]` (action, owner, due, linked KPI), `missing_inputs[]`.

**Library recommendation:** pre-Series A or ARR band `lt_1m`/`1m_3m` → recommend `series_a_ready` and `growth_leak`; otherwise `growth_leak`. Show all six.

**Fundraise bars:** never hard-coded. They come from approved Reference data rows tagged with the target stage, plus the advisor's rubric. Extend `research.ts` so the advisor can run "Research published Series A / Series B bars", producing **proposed** cited rows to approve — same rules as §8.5.

### 13.4 Objective form (step 2)

Short, one screen, saved on blur, editable later (edits after baseline flag "objective changed" to the advisor). Shared questions for every use case:
- What are you trying to achieve? (free text, required)
- How will you know you've succeeded? Pick the main metric (from the use case's figures) and your target value (required)
- By when? (date, required)
- Why now? (free text)
- What have you already tried? (free text)
- Constraints we should know about (budget, hiring freeze, board expectations…) (free text)

Plus 2–4 use-case-specific questions defined in the registry, e.g. `series_a_ready`: target raise amount, target close date, investor conversations so far; `hire_or_fix`: hiring budget, roles you're considering; `winning_icp`: segments you believe are best; `founder_handoff`: share of deals you're personally in, when you want to step back; `growth_leak`: where you think the leak is; `series_b_ready`: as Series A.

Answers are stored per company use case and passed to the Draft Agent as context. Founder-entered targets are allowed numbers for the code checks; they are labelled "your target" in the UI, never presented as analysis.

### 13.5 Multiple use cases
A company may activate several (each paid separately). A **use case switcher** at the top of the sidebar selects the active one; steps 3–5 follow it. Data items shared between use cases are uploaded once.

### 13.6 Stripe gate

> **Superseded (owner decision, Oct 26, 2026):** selecting a use case is now free, with a free questionnaire and Growth Snapshot; payment is a $499 Single Assessment per use case, plus an optional advisory session (from $750) and a reserved $299/month subscription. Prices are configurable. See README › "Pricing and the founder journey". The rest of this subsection is kept for history.

- Browsing the library and filling in the objective form are free (we capture intent even if they don't pay).
- Checkout is per company **per use case**; success returns to `/data` with that use case active; cancel returns to the form with answers kept.
- Payment activates the use case. The separate "unlock the preliminary Benchmark" payment is retired: once a use case is paid, its preliminary baseline (clearly labelled, shown only when code checks pass) is visible without a further payment, and the advisor-approved version replaces it.
- Price: keep the existing **$1** as a test price behind one config constant; the owner sets real pricing later.
- Advisors and admins can activate a use case for a company without payment (pilots), recorded with who and why.
- Reuse the existing webhook / return-verification / idempotency code; add `use_case` to `payments`. Event `use_case_activated` (keep `benchmark_unlocked` history).

### 13.7 Advisor view mirrors the founder flow
- Opening a company (`/advisor/companies/[id]`) shows the **same five steps** for that company — reuse the founder sidebar with a `basePath` of `/advisor/companies/[id]` (as `/sample` already does) — plus advisor actions on each step:
  - Overview: company summary, active use cases and which step each is on.
  - Use Case Library: the founder's objective answers; activate without payment; flag "objective changed".
  - Data: everything the founder sees plus validate items, request follow-ups, resolve conflicts.
  - Baseline: draft + QA results side by side, approve / request changes / send back (the existing review flow), edit targets with a note.
  - Progress & Tracking: add advisor notes to check-ins, adjust plan actions, mark re-baseline.
- Advisor top-level sidebar: Portfolio (adds columns: use case, step, KPI status on/at-risk/off-track, last check-in), Unassigned, Review Queue (filter by use case), Reference data (renamed from Benchmarks; adds stage tags), Score Rubrics (per use case), Analytics, Users, Settings. Registers fold into each company's Data step.

### 13.8 Progress & Tracking — rules
- KPIs come from the approved baseline. "Latest" is the newest accepted data point for that metric (new uploads in Data refresh it automatically) or a value the founder enters in a check-in (stored as a manual data point, unverified until the advisor validates).
- Status is computed in code: compare latest against a straight-line path from baseline (value, date) to target (value, date); on track ≥ path, at risk within 10% of the remaining gap behind, off track beyond that. Respect lower-is-better metrics.
- Monthly check-in: founder updates KPI values and action statuses and writes a short note; advisor adds a note. Reminder emails are Phase 2; for now show "check-in due" in the app.
- Re-baseline creates a new baseline version through the same review pipeline; history keeps every version and its KPIs.

### 13.9 Architecture and data
- **Registry:** `lib/use-cases/` — one module per use case: `id`, `title`, `shortTitle`, `whenUseful`, `youGet`, `objectiveQuestions` (extra form fields, Zod), `requiredItems` / `helpfulItems` / `optionalItems` (readiness keys, in priority order), `computeFigures(company) → { figures, sourceIds }` (pure code, unit-tested), `trackableMetrics`, optional `referenceMetrics`, `contentSchema` (Zod, extends the shared baseline shape), `draftBrief`, `qaBrief`, and the baseline page component. Add new metrics to `lib/metrics.ts` (gross margin, new/expansion/churned ARR, pipeline coverage, quota attainment, ramp months, founder-closed share, top-customer concentration, runway months, MoM growth).
- **Database (migrations):**
  - `company_use_cases` — company_id, use_case, status (`objective` → `active` → `baseline_in_review` → `tracking` → `closed`), objective (jsonb), objective_updated_at, activated_at, activated_by, activation (`paid` | `advisor`) + note; unique (company_id, use_case).
  - `deliverables` — add `company_use_case_id`; new deliverables are baselines for a use case. Legacy `benchmark` rows remain readable in history.
  - `kpi_targets` — company_use_case_id, deliverable_id (baseline version), metric, baseline_value, baseline_data_point_id, baseline_date, target_value, target_date, lower_is_better, target_note.
  - `plan_actions` — company_use_case_id, deliverable_id, title, detail, owner (`founder` | `advisor` | name), due_date, kpi_metric (nullable), status (`not_started` | `in_progress` | `done` | `blocked`), updated_by.
  - `check_ins` — company_use_case_id, period (month), founder_note, advisor_note, submitted_by, submitted_at.
  - `payments` — add `use_case`; replace `companies.benchmark_unlocked_at` with activation on `company_use_cases` (migrate existing unlocks to `growth_leak`).
  - `score_rubrics` — add `use_case`.
  - `companies.phase` — no longer drives navigation; derive step state from `company_use_cases`. Review `lib/phases.ts`.
- **Pipeline:** generalise `lib/ai/draft.ts` / `lib/ai/qa.ts` into one Draft Agent and one QA Agent that take a use case definition and the objective. Rename QA check `benchmark_methodology` → `method` ("reference data, rubric and targets used correctly"). Generalise `lib/deliverables/checks.ts` `allowedNumbers` to the use case's computed figures, reference rows and the founder's targets. Preliminary versions, supersession, throttling and code-check gating keep working, per use case.
- **Analytics events (add):** `library_viewed`, `use_case_viewed`, `objective_saved`, `checkout_started`, `use_case_activated`, `baseline_data_ready`, `baseline_built` (preliminary | approved), `check_in_submitted`, `kpi_status_changed`. All carry `use_case`.

### 13.10 Milestones

**U1 · New shell, Overview and Library.** Five-step founder sidebar with locked states and use case switcher; Overview visual; Library cards; objective form (shared + per-use-case questions, autosave); per-use-case Stripe gate and advisor activation; `company_use_cases`; redirects; advisor company view mirrored with the same five steps (content can be placeholders for 3–5).
*Done when:* a new founder signs up, lands on Overview, picks a use case, fills the objective, pays $1 (Stripe test mode on dev), and lands on Data with that use case active; the advisor sees the same steps for that company.

**U2 · Data prioritised per use case.** Data step scoped to the active use case (required → sharpening → optional, with why-it-matters per objective), drop zone and Google links reused, "Needs your answer" (conflicts/questions), Baseline readiness meter; advisor validation/follow-ups in the mirrored view.
*Done when:* Data shows only what the active use case needs, in priority order, and the meter reaches "ready" when required items are in.

**U3 · Baseline pipeline + `growth_leak` end to end.** Shared Draft/QA agents with objective context, code checks (figures + targets), KPIs and plan in the baseline, preliminary + advisor review, Source Trail, version history; rebuild `/sample` around Acme AI's Growth Leak baseline (its prototype story — "a sales efficiency problem, not a pipeline problem" — is a `growth_leak` result), suggesting `hire_or_fix` next.
*Done when:* upload → preliminary baseline → advisor approves → founder sees the approved baseline with KPIs and plan; works with zero reference rows.

**U4 · Progress & Tracking.** KPI cards (baseline → latest → target, status), plan actions, monthly check-ins, re-baseline; advisor notes; portfolio columns for step and KPI status.
*Done when:* a new upload or check-in value moves a KPI's status, and the advisor sees it in Portfolio and the company's Progress step.

**U5 · Fundraise readiness (`series_a_ready`, `series_b_ready`).** Shared engine, stage-tagged reference rows, "Research published bars" tool, per-stage rubrics, baseline page, tracked readiness areas in Progress.
*Done when:* a seed test company gets a Series A readiness baseline with every bar cited or marked "advisor rubric", and tracks it.

**U6 · `hire_or_fix` and `winning_icp`.**  **U7 · `founder_handoff`** (add "deal owner" as an expected column for `opportunities` in `lib/readiness.ts`).
*Each done when:* end to end as in U3–U4, with unit tests for `computeFigures` and an e2e path.

After U7: update `docs/TESTING.md`, README, permission and e2e suites; retire Benchmark-only code paths (keep Reference data).

### 13.11 Owner decisions still open (ask before building the affected part)
- Real pricing per use case (the $1 stays as a test price until then).
- Whether advisors can hide a use case for a company (default: no).
