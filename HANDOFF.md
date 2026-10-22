# HANDOFF.md — Growth Goaled v1

> **For Claude Code.** This file is the single source of truth for building Growth Goaled. Read all of it before writing code. Build Phase 1 milestone by milestone; stop at the end of each milestone, summarise what was built, and wait for the owner to confirm before starting the next. When this file and the prototype disagree, this file wins. When something is ambiguous, ask instead of guessing.

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

Growth Goaled is a Growth Intelligence platform for Series A B2B SaaS and AI companies ($2M–$10M ARR). A founder enters company data and uploads documents; the system extracts structured metrics, compares them with benchmark cohorts, and produces deliverables (Benchmark, Baseline, ICP, Channel Strategy, Hiring Plan). Each deliverable is drafted by a Draft Agent, checked by an independent QA Agent, and approved by a human advisor before the founder sees it. Every claim links to its sources.

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
