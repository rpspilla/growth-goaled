# Growth Goaled — Product Spec

Status: v2.1 — Use Case Library with five-step flow (Oct 26, 2026). Supersedes the Benchmark-led v1 (Oct 22). Source: Figma Make file "Growth-Goaled-Product-Video" plus owner decisions below.

## 1. What it is

Growth Goaled is a Growth Intelligence platform for B2B SaaS and AI companies from late seed through Series A (~$1M–$10M ARR). It helps a founder make the handful of high-stakes go-to-market decisions this stage forces: where growth is leaking, whether to hire, who to sell to, when to raise. Each answer comes from the company's own data, analysed with Growth Goaled's advisory method, drafted by AI, independently QA-checked, and approved by a human advisor before the founder sees it.

Promise: **Know where you stand. Know what to fix. Know what comes next.**

### Why a use case library (decision, Oct 26)
v1 led with a Benchmark against peer cohorts. With a young database the cohorts are thin, so the headline product was weakest exactly when we need it to be strongest. v2 leads with **use cases**: each one answers one founder decision and is useful on day one from the company's own data. Peer and published reference data still appears *inside* each use case as a reference line where it exists, and gets richer as more companies join (the compounding-intelligence story survives — it just isn't load-bearing at launch).

Core flow: **Pick a use case → connect the relevant data → receive an advisor-approved baseline and plan → track progress**

## 2. Users

| Role | Who | What they need to do |
|---|---|---|
| **Founder** | CEO/founder (sometimes CRO/COO) of a seed-to-Series A company | Pick the decision they face, share the data it needs, answer open questions, read approved analyses, see the source trail behind every claim |
| **Advisor** | Growth Goaled advisor managing ~20–30 companies | See portfolio health, open a company, review AI drafts against QA results, approve / request changes / send back, maintain reference data and scoring rubrics |
| **Admin** | Growth Goaled team | Users, assignment, reference data, system checks |

## 3. The Use Case Library (v1 set)

Each use case is one founder question with: a trigger (when founders come to it), the data items it needs (from the Data Readiness catalogue), the figures computed in code, optional reference data (approved published/advisory figures and/or the advisor's rubric), and a structured output.

| # | Use case (founder's question) | Typical trigger | Output |
|---|---|---|---|
| 1 | **Where is our growth leaking?** | Growth slowing; team disagrees why. Default starting point for founders who aren't sure. | ARR bridge (new / expansion / churn), funnel conversion, the single biggest constraint, and which use case to run next |
| 2 | **Are we ready to raise a Series A?** | Seed company, 6–12 months before a raise | Readiness by area (Ready / Close / Not yet), what investors will probe, 90-day plan to close gaps, timing vs runway |
| 3 | **Are we ready to raise a Series B?** | Series A company, 6–12 months before a raise | Same structure as #2 with Series B bars (efficiency, net retention, repeatable GTM) |
| 4 | **Should we hire more salespeople, or fix what we have first?** | After a raise, or board pressure to grow faster | Hire / don't hire yet, which role, when; capacity and productivity diagnosis; hiring timeline |
| 5 | **Who are we actually winning with?** | Long cycles, scattered customer base | Segments ranked by fit (win rate, ACV, cycle, retention, expansion), primary ICP, focus recommendation |
| 6 | **Is our sales repeatable without the founder?** | Founder still closes most deals; considering first sales leader | Handoff readiness score, gaps to close, when and whom to hire (first AE vs sales leader) |

#2 and #3 share one "fundraise readiness" engine with stage-specific bars. Bars are never hard-coded: they come from approved reference rows (published, cited) and the advisor's rubric for that stage.

Not in v1 (candidates for later): channel/budget allocation (folds into #1 as a recommendation for now), pricing & packaging, adding a product-led motion.

## 4. Founder experience — five steps

Sign-up and sign-in are unchanged. The founder sidebar has exactly five steps:

1. **Overview** — a simple visual of how the product works: pick a use case → connect the relevant data → receive an advisor-approved baseline and plan → track your progress. Shows where the founder is and their next action.
2. **Use Case Library** — browse the six use cases; choosing one opens a short objective form (what you're trying to achieve, the metric and target, by when, why now, what you've tried, constraints, plus 2–4 questions specific to the use case). Submitting goes to Stripe Checkout; payment activates the use case and unlocks steps 3–5. Browsing and the form are free.
3. **Data** — the data this use case needs, prioritised: what's required to establish the baseline first, then what sharpens it, then optional extras, each with why it matters for this objective. Upload anything, paste Google links, answer conflicts and questions found in the data. A meter shows when there's enough to build the baseline.
4. **Baseline** — the company's starting point against its objective: where each key metric stands, the gap to target, the main constraint, and the plan (actions and the KPIs to track). Advisor-approved; source trail on every claim; version history.
5. **Progress & Tracking** — ongoing monitoring: each KPI from baseline to latest to target with on-track / at-risk / off-track status, plan actions and their status, monthly check-ins with advisor notes, and re-baselining when things change.

A company can activate several use cases; a switcher picks which one steps 3–5 show. Company profile moves to the profile menu. The sample company (Acme AI) demonstrates the full flow on "Where is our growth leaking?".

## 5. Advisor experience

Opening a company shows the **same five steps** the founder sees, with advisor actions on each: review the objective and activate without payment for pilots (Library), validate data and request follow-ups (Data), review the draft against QA results and approve / request changes / send back (Baseline), add notes to check-ins and adjust the plan (Progress & Tracking).

Advisor top level: Portfolio (each company's use case, step, KPI status, last check-in), Unassigned, Review Queue, **Reference data** (the former Benchmarks library: cohorts, published bars tagged by stage, advisory CSV import, public research — feeds use cases as reference lines), Score Rubrics (per use case), Analytics, Users, Settings.

## 6. Data the app keeps

Unchanged from v1 except:
- **use cases** are defined in code (a registry), not the database.
- **company_use_cases** — company, use case, status (objective → active → baseline in review → tracking → closed), objective answers, activation (paid or advisor, with who and when).
- **kpi_targets**, **plan_actions**, **check_ins** — the baseline's KPIs and targets, the plan's actions and their status, and monthly check-ins (founder and advisor notes).
- **deliverables** — gain a `use_case` key; one deliverable per use case per version. Legacy `benchmark` deliverables stay readable as history.
- **payments** — one payment activates one use case for one company.
- **benchmark_* tables** — kept, presented as "Reference data". A use case can run with zero matching reference rows.
- **score_rubrics** — gain a `use_case` key so an advisor can keep a rubric per use case (e.g. Series A readiness bars).
- **metrics dictionary** — extended with the figures the use cases compute (gross margin, new/expansion/churned ARR, pipeline coverage, quota attainment, ramp, founder-closed share, top-customer concentration, runway).

## 7. How the intelligence works

- **Extraction & sorting:** uploads → Claude reads and sorts into the Data Readiness catalogue → structured data points with page-level source and confidence. Conflicts create register items.
- **Figures in code:** each use case computes its numbers in code from accepted data points. The model never calculates.
- **Draft Agent:** one shared agent with a per-use-case brief; returns the use case's structured JSON with every claim linked to sources.
- **QA Agent:** independent call; five checks — data consistency, method (reference data / rubric used correctly), source trail, recommendation logic, missing inputs. Plus code checks: every number traces to an input; every claim has a source.
- **Advisor gate:** nothing reaches a founder unapproved, except a clearly labelled preliminary baseline for a use case they've activated.
- **Tracking:** KPI status is computed in code against a straight-line path from baseline to the founder's target.
- **No reference data? Still useful.** Where no approved reference row exists, the analysis uses the company's own trend and the advisor's rubric, and says plainly that no peer reference is available yet.
- **Language:** "Growth Intelligence Analysis", never "AI generated this".
- **Privacy:** company data is never shown to other customers; only aggregates feed reference data.

## 8. Growth goal & metrics

Near-term goal: validate value and willingness to pay, and convert pilots to paid ($25K+ engagements). Instrument:

| Stage | Metric |
|---|---|
| Activation | % of signups who complete an objective form; % who pay to activate; % who reach "data ready" |
| Time to value | Hours from activation to preliminary baseline; to approved baseline |
| Engagement | Monthly check-in rate; % of plan actions completed; % of KPIs on track |
| Trust | % of source-trail panels opened; % of register items resolved by founder |
| Expansion | Use cases per company; % who start a second use case (especially #1 → its recommended next) |
| Advisor leverage | Review turnaround; % approved without changes |
| Revenue | Activations per use case; pilot → paid conversion; companies per advisor |

## 9. Design system (from Figma)

- Fonts: Instrument Serif (display), Inter (UI), JetBrains Mono (numbers/labels).
- Colors: background #F7F8FA, navy #0D1B2A, primary green #155A3C, green-muted #EBF5EF, amber #D97706, red #DC2626, blue #1D4ED8, border #E2E8F0. Radius 8px.
- Light, premium, generous whitespace, minimal shadows. No glowing/sci-fi AI clichés. Charts: Recharts.

## 10. Tech stack

Unchanged: Next.js on Vercel, Neon Postgres + Drizzle, Neon Auth, Vercel Blob, Claude API server-side, Stripe for unlocks. Environments: `main` → app.growthgoaled.com; `dev` → dev.growthgoaled.com, each with its own Neon branch.

## 11. Phasing

- **Phase 1 (done, Oct 22–24):** foundation, auth/roles, signup/invites, intake, Data Readiness + extraction, registers, reference-data library, Benchmark end to end, portfolio, analytics, preliminary $1 unlock.
- **Phase 1.5 — Use Case Library (next):** see HANDOFF.md §13 (rev. 2). U1 shell, Overview, Library + Stripe gate → U2 Data → U3 Baseline (Growth Leak end to end) → U4 Progress & Tracking → U5 Series A / B readiness → U6 Hire or fix, Who are we winning with → U7 Founder-led handoff.
- **Phase 2:** reminders, Google Drive import, score shown on dashboard, use cases 7+.
- **Phase 3:** methodology / data-quality screens, compounding-intelligence page, billing beyond unlocks.

## 12. Decisions log

1. **Reference (benchmark) data** comes from (a) public published data Claude researches, stored as aggregates with full citation, and (b) the owner's advisory data via CSV. Every figure carries source, year, sample size and an advisor "approved" flag. Nothing unapproved feeds an analysis. *(Oct 22)*
2. **Scoring** is advisor-defined via rubrics; the app computes, the advisor can override with a note. Rubrics are now per use case. *(Oct 22, extended Oct 26)*
3. **Signup:** founders self-sign-up (unassigned queue) and advisors can invite founders. *(Oct 22)*
4. **Google Drive:** Phase 2. *(Oct 22)*
5. **Domains:** www.growthgoaled.com (marketing, untouched), app.growthgoaled.com (prod), dev.growthgoaled.com (staging). *(Oct 22)*
6. **Preliminary unlock:** founders could unlock a preliminary Benchmark for $1 via Stripe. *(Oct 24, set during build — superseded by #9)*
7. **Product leads with a Use Case Library, not Benchmark.** Benchmark becomes reference data used inside use cases. *(Oct 26)*
8. **Series A readiness added** as a use case. This widens the target market down to late-seed companies (~$1–3M ARR) raising their A. *(Oct 26)*
9. **Five-step flow:** Overview → Use Case Library (objective form, Stripe-gated per use case) → Data (prioritised for the use case) → Baseline → Progress & Tracking. Advisor view mirrors it per company. Sign-in unchanged. $1 stays as a test price until real pricing is set. *(Oct 26)*
