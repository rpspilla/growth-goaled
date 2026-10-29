# Brief: rebuild the public sample (/sample) on the current founder flow

**Owner request, Oct 28, 2026.** Build on `dev`, stop for review on dev.growthgoaled.com before merging to `main`.

## Why
`/sample` (the no-login Acme AI demo) still shows the old benchmark-led product: a dashboard and a 14-company cohort Benchmark (`SAMPLE_PATHS = ["/dashboard", "/benchmark"]`). The product now runs on the five-step flow (Overview → Growth questions → Data → Results → Action plan). The website designer needs `/sample` for product screenshots, and prospects will be sent there, so it must show the real, current experience.

## Outcome
A logged-out visitor can walk Acme AI through every founder step, read-only, and it looks exactly like the real app for a company that has bought one assessment and committed to its plan.

## Featured question
Use **Build a growth hiring plan** (`hire_or_fix`) as Acme's purchased assessment. Acme's story from the prototype is "sales efficiency, not pipeline: fix it before you hire" (`prototype/src/data/mock.ts`), which is exactly this question's verdict ("fix first"). Show the other two live questions as not started, and the three coming-soon questions as coming soon, exactly as the real Library does.

## Pages (all under `/sample`, reusing the real founder components)
| Sample URL | Real page it mirrors | What Acme shows |
|---|---|---|
| `/sample` | `/overview` | Overview with Acme's current step (tracking), peer comparisons, next action |
| `/sample/library` | `/library` | All six cards: hiring plan "Purchased", churn and sales motion "Not started", three "Coming soon" |
| `/sample/library/hire_or_fix` | `/library/[useCase]` | Who it's for, what you get, price, how it works, data needed; questionnaire shown filled in and disabled |
| `/sample/library/hire_or_fix/snapshot` | snapshot | Acme's free Growth Snapshot incl. the peer comparison card |
| `/sample/data` | `/data` | Data checklist for the hiring plan with every required item supplied, readiness meter at ready, 3 recorded sales calls listed; no upload or run controls |
| `/sample/baseline` | `/baseline` (Results) | Published hiring-plan results organised by plan dimensions (capacity, pipeline, sales calls, hiring), Source Trail working |
| `/sample/progress` | `/progress` (Action plan) | Committed plan with a realistic mix of action statuses (done / in progress / not started) and tracked metrics vs baseline |

- Same five-step sidebar as founders (`FounderSidebar` with `basePath="/sample"`), all steps unlocked; update `SAMPLE_PATHS`/`sampleHref` accordingly.
- Redirect old `/sample/benchmark` → `/sample/baseline`. Retire the old `DashboardView`/`BenchmarkView` usage in the sample.
- Use the founder-facing labels exactly as the app shows them today (e.g. "Growth questions", "Results", "Action plan").

## Data
- Extend `lib/seed/data.ts` (runs on every deploy, Acme only in production) so Acme has: company profile and questionnaire answers for `hire_or_fix`; a `company_use_cases` row activated (`activation = advisor`, note "sample"); accepted data points for every figure the results show; data items for the hiring plan's required items, including 3 recorded sales calls (so the sales call review is complete and the advisor isn't flagged to collect them); one **published** results deliverable with content that validates against the current results schema; committed plan actions and tracked metrics.
- **Deterministic:** seed the results content as fixed JSON. No AI calls when seeding or viewing the sample.
- **Every figure must trace to a seeded data point**, same rule as real reports. Use the Acme numbers in `prototype/src/data/mock.ts` (ARR $4.2M, 72% growth, NRR 108%, ACV $42K, 94-day cycle, 5 AEs, 2 SDRs, AE productivity $840K, etc.).
- Peer comparisons: use the sample cohort or the standard reference, clearly labelled illustrative, as today. Never let sample rows match real companies.
- Idempotent with fixed ids, as the current seed is.

## Read-only and safe
- Visible banner on every sample page: "Sample company · illustrative data" with a primary button **Get my free Growth Snapshot** → `/sign-up`.
- Hide or disable every action (questionnaire submit, upload, Google link, run, checkout, commit plan, status changes, advisory request). Nothing should look clickable that doesn't work.
- Server side: every action must refuse the sample company (`is_sample`) even if called directly. Add a test.
- No sign-in prompts or errors anywhere in the walkthrough.

## Screenshots for the website
After it's built, capture PNGs with Playwright at 1440×900 (and 390×844 for Library and Results) of: Library, Snapshot, Results (top of page), Action plan, Overview. Save them to `docs/screenshots/sample/` and list them in this brief's "Done" note so the owner can send them to the web designer.

## Done when
- All seven URLs load logged out on dev.growthgoaled.com, match the real founder screens, and contain no dead controls.
- e2e test walks the sample end to end; permission test proves sample actions are refused.
- Screenshots committed.
- README "Seed data and the sample company" section updated.
- Then stop and summarise for owner review. Owner merges to `main` after checking.
