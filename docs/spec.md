# Growth Goaled — Product Spec

Status: v2 — Use Case Library (Oct 26, 2026). Supersedes the Benchmark-led v1 (Oct 22). Source: Figma Make file "Growth-Goaled-Product-Video" plus owner decisions below.

## 1. What it is

Growth Goaled is a Growth Intelligence platform for B2B SaaS and AI companies from late seed through Series A (~$1M–$10M ARR). It helps a founder make the handful of high-stakes go-to-market decisions this stage forces: where growth is leaking, whether to hire, who to sell to, when to raise. Each answer comes from the company's own data, analysed with Growth Goaled's advisory method, drafted by AI, independently QA-checked, and approved by a human advisor before the founder sees it.

Promise: **Know where you stand. Know what to fix. Know what comes next.**

### Why a use case library (decision, Oct 26)
v1 led with a Benchmark against peer cohorts. With a young database the cohorts are thin, so the headline product was weakest exactly when we need it to be strongest. v2 leads with **use cases**: each one answers one founder decision and is useful on day one from the company's own data. Peer and published reference data still appears *inside* each use case as a reference line where it exists, and gets richer as more companies join (the compounding-intelligence story survives — it just isn't load-bearing at launch).

Core flow: **Pick the decision → share the data it needs → Growth Intelligence Analysis → advisor review → action plan**

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

## 4. Founder experience

1. **Welcome** — start, or explore the sample company (Acme AI, read-only).
2. **Company profile** — light intake (name, stage, ARR band, model) so we can recommend use cases.
3. **"What are you trying to decide?"** — the library: six cards, each showing how ready the founder's data is for it. Recommendation: seed / <$3M ARR → #2 and #1; otherwise → #1.
4. **Use case page** — checklist of only the data this use case needs (reusing Data Readiness upload/sorting), then build. A preliminary analysis is available right after uploads (paid unlock, see §8); the advisor-approved version replaces it.
5. **Questions / Registers** — conflicts, assumptions and gaps found while reading their data.
6. **Deliverables** — every analysis, with status and history.
7. **Source Trail** (side panel, everywhere) — sources behind each claim, confidence, method.

## 5. Advisor experience

Portfolio, Unassigned, Company view (now shows which use cases each company has started and their status), Review Queue (per use case), **Reference data** (the former Benchmarks library: cohorts, published bars, advisory CSV import, public research — feeds use cases as reference lines), Score Rubrics (now per use case, including Series A and Series B readiness rubrics), Registers, Analytics, Users, Settings.

## 6. Data the app keeps

Unchanged from v1 except:
- **use cases** are defined in code (a registry), not the database.
- **company_use_cases** — company, use case, status (not_started | collecting | building | in_review | published), started_at, started_by.
- **deliverables** — gain a `use_case` key; one deliverable per use case per version. Legacy `benchmark` deliverables stay readable as history.
- **payments** — unlock is per company per use case.
- **benchmark_* tables** — kept, presented as "Reference data". A use case can run with zero matching reference rows.
- **score_rubrics** — gain a `use_case` key so an advisor can keep a rubric per use case (e.g. Series A readiness bars).
- **metrics dictionary** — extended with the figures the use cases compute (gross margin, new/expansion/churned ARR, pipeline coverage, quota attainment, ramp, founder-closed share, top-customer concentration, runway).

## 7. How the intelligence works

- **Extraction & sorting:** uploads → Claude reads and sorts into the Data Readiness catalogue → structured data points with page-level source and confidence. Conflicts create register items.
- **Figures in code:** each use case computes its numbers in code from accepted data points. The model never calculates.
- **Draft Agent:** one shared agent with a per-use-case brief; returns the use case's structured JSON with every claim linked to sources.
- **QA Agent:** independent call; five checks — data consistency, method (reference data / rubric used correctly), source trail, recommendation logic, missing inputs. Plus code checks: every number traces to an input; every claim has a source.
- **Advisor gate:** nothing reaches a founder unapproved, except a clearly labelled preliminary version the founder has unlocked.
- **No reference data? Still useful.** Where no approved reference row exists, the analysis uses the company's own trend and the advisor's rubric, and says plainly that no peer reference is available yet.
- **Language:** "Growth Intelligence Analysis", never "AI generated this".
- **Privacy:** company data is never shown to other customers; only aggregates feed reference data.

## 8. Growth goal & metrics

Near-term goal: validate value and willingness to pay, and convert pilots to paid ($25K+ engagements). Instrument:

| Stage | Metric |
|---|---|
| Activation | % of signups who start a use case; % who reach "data ready" for it |
| Time to value | Hours from signup to first preliminary analysis; to first approved analysis |
| Trust | % of source-trail panels opened; % of register items resolved by founder |
| Expansion | Use cases per company; % who start a second use case (especially #1 → its recommended next) |
| Advisor leverage | Review turnaround; % approved without changes |
| Revenue | Preliminary unlocks per use case; pilot → paid conversion; companies per advisor |

## 9. Design system (from Figma)

- Fonts: Instrument Serif (display), Inter (UI), JetBrains Mono (numbers/labels).
- Colors: background #F7F8FA, navy #0D1B2A, primary green #155A3C, green-muted #EBF5EF, amber #D97706, red #DC2626, blue #1D4ED8, border #E2E8F0. Radius 8px.
- Light, premium, generous whitespace, minimal shadows. No glowing/sci-fi AI clichés. Charts: Recharts.

## 10. Tech stack

Unchanged: Next.js on Vercel, Neon Postgres + Drizzle, Neon Auth, Vercel Blob, Claude API server-side, Stripe for unlocks. Environments: `main` → app.growthgoaled.com; `dev` → dev.growthgoaled.com, each with its own Neon branch.

## 11. Phasing

- **Phase 1 (done, Oct 22–24):** foundation, auth/roles, signup/invites, intake, Data Readiness + extraction, registers, reference-data library, Benchmark end to end, portfolio, analytics, preliminary $1 unlock.
- **Phase 1.5 — Use Case Library (next):** see HANDOFF.md §13. Framework + library, then use cases in order: Where is growth leaking? → Series A / Series B readiness → Hire or fix → Who are we winning with → Founder-led handoff.
- **Phase 2:** reminders, Google Drive import, score shown on dashboard, use cases 7+.
- **Phase 3:** methodology / data-quality screens, compounding-intelligence page, billing beyond unlocks.

## 12. Decisions log

1. **Reference (benchmark) data** comes from (a) public published data Claude researches, stored as aggregates with full citation, and (b) the owner's advisory data via CSV. Every figure carries source, year, sample size and an advisor "approved" flag. Nothing unapproved feeds an analysis. *(Oct 22)*
2. **Scoring** is advisor-defined via rubrics; the app computes, the advisor can override with a note. Rubrics are now per use case. *(Oct 22, extended Oct 26)*
3. **Signup:** founders self-sign-up (unassigned queue) and advisors can invite founders. *(Oct 22)*
4. **Google Drive:** Phase 2. *(Oct 22)*
5. **Domains:** www.growthgoaled.com (marketing, untouched), app.growthgoaled.com (prod), dev.growthgoaled.com (staging). *(Oct 22)*
6. **Preliminary unlock:** founders can unlock a preliminary analysis for $1 via Stripe before advisor review. *(Oct 24, set during build)*
7. **Product leads with a Use Case Library, not Benchmark.** Benchmark becomes reference data used inside use cases. *(Oct 26)*
8. **Series A readiness added** as a use case. This widens the target market down to late-seed companies (~$1–3M ARR) raising their A. *(Oct 26)*
