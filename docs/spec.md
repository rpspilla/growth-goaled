# Growth Goaled — Product Spec (v1 build)

Status: DRAFT for review · Source: Figma Make file "Growth-Goaled-Product-Video" (brief + 17-screen prototype)

## 1. What it is

Growth Goaled is a Growth Intelligence platform for Series A B2B SaaS and AI companies (~$2M–$10M ARR). It tells a founder where their go-to-market engine stands against comparable companies, what is actually constraining growth, and what to do next. Every recommendation is AI-drafted, independently QA-checked, and approved by a human advisor before the founder sees it.

Promise: **Know where you stand. Know what to fix. Know what comes next.**

Core flow: Company data → GTM profile → Benchmark → Baseline → ICP → Channel Strategy → Hiring Plan → Advisor Review → Action

## 2. Users

| Role | Who | What they need to do |
|---|---|---|
| **Founder** | CEO/founder (sometimes CRO/COO) of a Series A company | Enter company data, upload documents, answer open questions, read approved deliverables, see source trail behind every claim |
| **Advisor** | Growth Goaled advisor managing a portfolio of ~20–30 companies | See portfolio health, open a company, review AI drafts against QA results, approve / request changes / send back, manage benchmark cohorts |
| **Admin** (internal, can be same person as advisor in v1) | Growth Goaled team | Manage benchmark data, methodology, users, data quality |

## 3. Founder jobs (screens from prototype)

1. **Welcome** — start profile or explore sample company (Acme AI demo stays as a read-only sample).
2. **Intake** — five sections (Company, Customers, GTM, ICP, Hiring), autosaves, shows % complete, resume later.
3. **Upload** — board deck, financial model, customer list, GTM plan, sales deck, hiring plan. Google Drive connect. System extracts structured data points and flags assumptions for review.
4. **Processing** — staged progress while the profile is built.
5. **Dashboard** — key metrics, Growth Intelligence Score (0–100) with label, strengths / watch areas / priority.
6. **Benchmark** — cohort definition, metric table vs median and top quartile, ahead/behind indicators, headline insight, methodology link.
7. **Baseline** — three findings + core diagnosis.
8. **ICP** — segments with fit scores; click for win rate, ACV, cycle, retention, expansion, benchmark fit; primary ICP recommendation.
9. **Channel Strategy** — current vs benchmark vs recommended allocation; ranked priorities; reallocation recommendation.
10. **Hiring Plan** — current vs benchmark team, recommended hires, Q-by-Q timeline.
11. **Questions / Registers** — data conflicts to resolve (Resolve / Mark unknown / Use uploaded data); registers of missing info, unresolved questions, conflicts, assumptions, follow-ups; reminders.
12. **Deliverables** — list of all deliverables with status.
13. **Source Trail** (side panel, everywhere) — sources behind a claim, confidence level, methodology text.

## 4. Advisor jobs

1. **Portfolio** — counts (active, need attention, awaiting founder, in review, complete) + table (company, stage, ARR, growth, health, phase, attention).
2. **Company View** — metrics, phase, score, benchmark position, current recommendation, open questions, confidence, advisor summary.
3. **Review Queue** — deliverables awaiting review; Draft Agent and QA Agent status; QA checklist (data consistency, benchmark methodology, source trail, recommendation logic, missing inputs); Approve / Request Changes / Send Back to AI.
4. **Benchmarks** — cohort library.
5. **Methodology / Data Quality** — sources, completeness, consistency, confidence with explanations.

## 5. Data the app keeps

- **companies** — profile fields from intake (name, website, industry, stage, ARR, growth, funding, employees, customers, ACV, NRR, GRR, sales cycle, segment, sales model, founder-led flag), current phase, health, assigned advisor.
- **users** — name, email, role (founder | advisor | admin).
- **company_members** — user ↔ company link (founders see only their company; advisors see their portfolio).
- **intake_responses** — section, field, value, source (manual | extracted), updated_at. Drives % complete.
- **documents** — company, type, file location, status (uploaded | analyzing | done | failed), uploaded_by.
- **data_points** — company, metric, value, period, source document/page, confidence, accepted flag. One metric can have several competing data points (that's how conflicts are detected).
- **register_items** — company, type (missing | question | conflict | assumption | follow_up), description, linked data points, status (open | resolved | unknown), resolution, due/reminder date.
- **benchmark_cohorts** — name, criteria (stage, ARR range, model, GTM motion), company count, updated_at.
- **benchmark_metrics** — cohort, metric, median, top quartile, bottom quartile, sample size, source. Aggregates only — never another company's raw data.
- **deliverables** — company, type (benchmark | baseline | icp | channels | hiring), version, status (drafting | qa | in_review | changes_requested | approved | published), content (structured JSON), score/headline.
- **sources** — deliverable claim ↔ supporting data points / cohort / methodology, confidence. Powers the Source Trail panel.
- **reviews** — deliverable version, QA check results, advisor decision, comments, reviewer, timestamp.
- **benchmark_sources** — name, publisher, URL, year, licence/usage note, type (public | advisory), imported_by.
- **score_rubrics** — advisor, name, criteria (metric, weight, bands → points), labels by score range. **company_scores** — company, rubric, computed score, override score + note, computed_at.
- **invites** — email, company, inviting advisor, token, expires_at, accepted_at.
- **events** — product analytics (see §7).

## 6. How the intelligence works (v1)

- **Extraction:** uploaded documents → Claude API → structured data points with page-level source and confidence. Conflicts with intake answers create register items automatically.
- **Draft Agent:** Claude generates each deliverable as structured JSON (not free text) from accepted data points + cohort benchmarks, with every claim linked to sources.
- **QA Agent:** a separate Claude call checks the draft against the five QA checks and returns pass/fail with notes. It never sees the Draft Agent's reasoning.
- **Advisor gate:** nothing reaches a founder until an advisor approves it.
- **Language:** UI says "Growth Intelligence Analysis", never "AI generated this".
- **Privacy:** company data is never shown to other customers; only aggregated cohort statistics feed benchmarks.

## 7. Growth goal & metrics

The near-term goal is to validate the five questions from the brief and convert pilots to paid ($25K+). Product metrics to instrument from day one:

| Stage | Metric |
|---|---|
| Activation | % of invited founders who complete intake ≥ 80% and upload ≥ 1 doc |
| Time to value | Hours from signup to first approved Benchmark |
| Trust | % of source-trail panels opened; % of register items resolved by founder |
| Advisor leverage | Review turnaround time; % approved without changes |
| Revenue | Pilot → paid conversion; companies per advisor |

## 8. Design system (from Figma)

- Fonts: Instrument Serif (display), Inter (UI), JetBrains Mono (numbers/labels).
- Colors: background #F7F8FA, navy #0D1B2A, primary green #155A3C, green-muted #EBF5EF, amber #D97706, red #DC2626, blue #1D4ED8, border #E2E8F0. Radius 8px.
- Light, premium, generous whitespace, minimal shadows. No glowing/sci-fi AI clichés.
- Charts: Recharts.

## 9. Tech stack

- Next.js (App Router, TypeScript) on Vercel; port the Figma Make React components (React 19 + Tailwind 4) directly.
- Neon Postgres via the Vercel integration; Drizzle ORM + migrations.
- Auth: Neon Auth (roles: founder / advisor / admin), email magic link to start.
- File storage: Vercel Blob for uploads.
- AI: Claude API (Anthropic Console key in Vercel env vars, server-side only).
- Environments: `main` → app. (production); `dev` branch → dev. (staging) with its own Neon branch.

## 10. Phasing

**Phase 1 (first deploy):** auth + roles, intake with autosave, document upload + extraction, registers, advisor portfolio + company view, Benchmark deliverable end-to-end (draft → QA → review → publish) with source trail, sample company (Acme AI) as seeded demo.

**Phase 2:** Baseline, ICP, Channel Strategy, Hiring Plan deliverables; dashboard score; reminders; Google Drive connect.

**Phase 3:** methodology/data-quality screens, cohort management UI, compounding-intelligence page, billing.

## 11. Decisions (confirmed Oct 22, 2026)

1. **Benchmark data** comes from two places: (a) publicly available benchmark data Claude researches (published SaaS surveys, open datasets), stored as aggregates with full citation; (b) the founder's existing advisory data, imported by CSV. Every benchmark figure carries its source, year, sample size, and an advisor "approved for use" flag. Nothing unapproved feeds a deliverable.
2. **Growth Intelligence Score** is advisor-defined. Each advisor builds a scoring rubric (metrics, weights, target/threshold bands, score labels). The app computes the score from the rubric; the advisor can override per company with a note.
3. **Signup:** founders can self-sign-up (creates a new company, lands in an "unassigned" queue for an advisor/admin to claim) AND advisors can invite founders by email (company pre-assigned to that advisor).
4. **Google Drive:** Phase 2.
5. **Domains:** marketing site stays at www.growthgoaled.com; app at **app.growthgoaled.com** (production, `main`); staging at **dev.growthgoaled.com** (`dev` branch).
