# CRO Intelligence: assessment and plan (Nov 2, 2026)

Response to the brief "Growth Goaled — Product Evolution, CRO Intelligence & Multi-Expert Learning System". Inspected on `dev` at 8e40ffd (same as `main`). Nothing has been built yet.

## 1. What exists today

**Stack (one correction to the brief):** there is no Python backend. Everything is one Next.js 16 (App Router, React 19, TypeScript) app on Vercel. Claude is called directly from the server code (`lib/ai/`, Anthropic SDK). Data is Postgres on Neon via Drizzle, with migrations in `drizzle/` applied on each deploy. Auth is Neon Auth. Files go to Vercel Blob, payments to Stripe, email through Resend. Production is app.growthgoaled.com (Neon `main`), and dev is dev.growthgoaled.com (Neon `dev`). I recommend not adding a Python service: nothing in the brief needs one.

**Production data today:** 5 users (2 staff), 5 companies, 1 paid assessment, 7 plan actions, 1 document. Migration risk to real data is low, but every change below is additive anyway.

**Founder workflow (works, keep):**
- Sign-up with six basics → free **Snapshot** from one key file → **$149 assessment** per question (Stripe).
- Six questions ("use cases"). Three are live: *Repeatable sales motion* (`winning_icp`), *Growth hiring plan* (`hire_or_fix`), *Fix churn* (`growth_leak`). Three are "coming soon": Series A ready, Series B ready, Founder handoff.
- **Data step:** upload any files. They're sorted into a 40-item data checklist, and figures are calculated **in code** (ARR, growth, NRR/GRR, win rate, sales cycle, runway…), each with method and source.
- **Assessment engine:** rule-based diagnosis (ranked constraints, evidence for/against, certainty) → Claude drafts a structured **Decision Brief** → code checks (every number traceable) → QA agent. It produces a staged 30/60/90 plan organised by dimension (ICP, sales calls, channels, hiring), and every statement has a **Source Trail**.
- **Plan and progress:** commit the plan, track each action's status, a monthly progress email (cron), performance metrics, and assessment history with what changed.
- **Benchmarks:** a versioned Benchmark Library with source, licence, sample size, period and reliability. The standard reference is always labelled an assumption. Peer comparisons are on the Overview.

**Advisor/admin (works, keep):**
- Portfolio and unassigned queue; per-company mirror of every founder step.
- Review queue (approve before publish), registers (questions, conflicts, assumptions), rubrics, analytics, the benchmark library and users.
- Roles are `founder`, `advisor` and `admin` (one per user). There's also a self-serve founder ⇄ advisor switch.

**Already strong foundations for the vision:**
- Facts vs. calculations vs. interpretations vs. hypotheses are already labelled on every claim (`claims`, `claim_sources`).
- Confidence and "what's missing" are already first-class: certainty rules, data gaps, a "would change this recommendation" section.
- Every AI call is logged (`agent_runs`: model, tokens, input hash, output).
- Product analytics events (`events`) and a permissions test that fails the build if any server action skips its access check.
- Tenant isolation is enforced in one data layer (`founderCompany()`, `canViewCompany`), not page by page.

## 2. Gap analysis against the brief

| Brief area | Today | Gap |
|---|---|---|
| Conversational front door, 12 starters | None. Form + report flow. | **New.** Biggest change. |
| 12 use cases | 3 live, 3 coming soon. A ≈ Repeatable sales motion, I ≈ Growth hiring plan, K ≈ Fix churn, H ≈ Series A ready (not live). J partly covered. | **B–G (first hire, profiles, pay, equity, quota, commission) don't exist.** D/E need sourced compensation data, which the benchmark library doesn't have. |
| Progressive collection | Partly: works with whatever's shared, lists gaps. | Needs to happen inside a conversation, not a checklist. |
| Standard output format | Decision Brief has these sections, in a longer form. | Needs a **short card** version for chat, with the full brief on demand. |
| Persistent company memory | Strong *structured* memory (profile, answers, figures, files, briefs, plans). | No memory of conversations; facts said in chat aren't captured. |
| Structured interaction records | Briefs and plans are structured. | No per-recommendation record linking question → diagnosis → recommendation → feedback → outcome. |
| Feedback and outcomes | Plan action status only, plus a monthly email. | No "helpful/incorrect/disagree", no implemented/result tracking, no 30/60/90 follow-ups. |
| Methodology versioning, evals, rollback | Prompts and rules live in code (versioned by git only); the model is recorded per run. | No methodology version on outputs, no scenario test library, no rollback other than redeploy. |
| CRO Intelligence Studio | Advisor portal for client work only. | **New:** contributors, expertise, assignments, submissions, reviews, approval, library. |
| Fine-grained permissions | One role per user. | Need per-person permissions and assignment-scoped access. |
| Audit log | Events table (analytics). | No audit trail of sensitive actions (access, approve, export). |
| Consent for aggregated learning | None. | Need a consent flag per company before any cross-company use. |
| Vector search / RAG | None. | Not needed yet (see §3). |
| ChatGPT / Claude (MCP) | None. | Later. Design for it now by keeping the engine callable as functions. |
| Crawlable topic pages | `/sample` and the landing page only. | New, but cheap. Needs approved content. |

## 3. Proposed architecture (built on the current app)

- **One engine, many front doors.**
  - The existing engine (figures, readiness, diagnostics, benchmarks, assessment drafting) is exposed as a small set of typed **tools** in `lib/engine/`, such as `getCompanyContext`, `getFigures`, `compareToBenchmarks`, `runDiagnostic(topic)`, `getPlan` and `recordFact`.
  - The chat calls these through Claude tool use.
  - Later, an MCP server and a ChatGPT app call the same functions, with the same access checks.
- **Conversation:**
  - New `conversations` and `messages` tables, plus a streaming chat route.
  - Each conversation belongs to one company, and every tool is scoped to that company through the existing guards.
  - The 12 starters are a **topic registry**: each topic names its framework, required and helpful facts, and output shape. Three topics reuse today's use cases, so the chat can hand off to the paid deep assessment.
- **Memory = structured facts, not transcripts:**
  - Things the founder says in chat become **company facts** (value, source = conversation, status = founder-stated / assumption / verified), shown on the profile, where the founder can correct them.
  - The AI reads facts plus existing figures before asking anything, so it never re-asks.
- **Recommendations as records:**
  - Every substantive answer is saved as a `recommendation`: topic, stage, company characteristics snapshot, diagnosis, evidence ids, confidence, recommendation, next steps, success measures, and the methodology version that produced it.
  - Feedback and outcomes attach to it.
- **Methodology, separate from code:**
  - Approved frameworks, rules, questions and examples live in a `methodology_items` table (topic, stage, industry, conditions, reasoning, exceptions, author, version, status).
  - At answer time, approved items matching the topic, stage and industry are inserted into the prompt by **tag filter**.
  - A `methodology_releases` snapshot is what's live, so rollback is choosing an earlier release.
  - Add pgvector (built into Neon, no new service) only once there are a few hundred items and tag filtering stops finding the right ones.
- **No fine-tuning.** Retrieval, rules, prompts and evals only, as the brief says.

## 4. Preserve (do not break)

- Sign-up, auth and multi-company.
- Snapshot, the $149 purchase and Stripe.
- The Data step, sorting and the metrics engine.
- The assessment engine with code checks, QA and Source Trail.
- Plan, progress, monthly email and performance.
- The Benchmark Library and peer comparisons.
- The advisor portal and review queue.
- All existing tables and data. Every change below is additive, with no destructive migrations.

## 5. Prioritized plan

Sizes assume one engineer working with Claude Code; they're rough.

**Phase 1a — Conversation MVP (recommended first; ~1.5–2 weeks)**
1. Chat on the Overview with the 12 starters (exact wording), using company context read-only, 1–2 questions at a time, and fact/assumption labels.
2. Each answer ends in a **short recommendation card**: takeaway, diagnosis, evidence, confidence, priority, recommendation, next steps, success measures, 30/60/90.
3. Starters 1, 9 and 11 (and later 8) offer "go deeper" into the existing paid assessment.
4. Facts from chat are saved as company facts, which the founder can edit.
5. Recommendations are saved as records, with feedback buttons (helpful / incomplete / incorrect / not relevant / disagree).
6. Cost and abuse limits: messages per day and per company, and a token budget.

**Phase 1b — New topics (~1 week, partly blocked on data — see §8):** first GTM hire, hiring profiles, quota, commission plan, as conversation frameworks with clear "estimate" labels. Pay and equity ship only with a sourced dataset, or explicitly labelled as estimates and ranges with assumptions.

**Phase 2 — Learning foundation (~1–1.5 weeks)**
- Methodology version on every output.
- Implementation and outcome capture, with 30/60/90 follow-ups that extend the existing cron and email.
- A scenario library with an eval runner (a script that replays scenarios against a methodology release and scores them).
- A quality report in Advisor → Analytics.

**Phase 3 — CRO Intelligence Studio MVP (~2–3 weeks)**
- `/studio`, styled as a work tool rather than the chat.
- Contributor invites and profiles, expertise areas, assignments (primary / reviewer / approver).
- Structured submissions (principle, framework, questions, example, exception) and AI output review (approve / revise / reject, with reasoning).
- An approval workflow into the methodology library, version history and an audit log.

**Phase 4 — Advanced Studio:** scenario simulation UI, compare across releases, multi-expert reviews and disagreements, conditional recommendations, case capture with anonymisation, contributor reporting.

**Phase 5 — Integrations:** API and MCP server over `lib/engine`, ChatGPT and Claude apps with OAuth consent, CRM and accounting connectors, aggregated benchmarks (only with consent and minimum sample sizes).

**Anytime, small:** crawlable topic pages (`/guides/...`) for the 11 topics, written from approved methodology.

## 6. Database changes (all additive)

| Phase | Tables / columns |
|---|---|
| 1a | `conversations` (company, user, topic, status) · `messages` (role, content, tool calls, tokens) · `company_facts` (key, value, source, status, conversation id) · `recommendations` (company, conversation/deliverable, topic, stage, snapshot, diagnosis, evidence, confidence, body, methodology version) · `recommendation_feedback` (kind, note, user) |
| 2 | `recommendation_outcomes` (implemented status, result, measured metric, follow-up date) · `methodology_releases` · `eval_scenarios` · `eval_runs` |
| 3 | `contributors` (profile, relationship type, status) · `expertise_areas` + links · `contributor_permissions` · `assignments` (subject, contributor, role: primary/reviewer/approver) · `methodology_items` (+ versions) · `submissions` · `expert_reviews` · `audit_log` |
| 3 | `companies.shared_learning_consent` (+ consent date / by) |

The `user_role` enum stays as it is. Contributors are users with a contributor profile plus explicit permissions, so nothing about founder and advisor access changes.

## 7. Security and permissions

- **Chat tools reuse the existing company guards.** Tools take no company id from the model; it comes from the session. A permissions test like today's will cover the new routes.
- **Prompt injection:** uploaded documents and chat text are data, never instructions. Tools are read-only except `recordFact`, which only writes to the current company.
- **Contributors see no company data by default.** They get access only to assigned scenarios, or to anonymised cases from companies that consented. Advisors keep their current client access.
- **Audit log** for: approve or publish methodology, view company data as contributor or advisor, exports, permission changes, consent changes.
- **Consent:** cross-company use only for companies with `shared_learning_consent`, aggregated, with a minimum sample size before anything is shown. This needs a line in the terms of service (owner/legal).
- **Cost and abuse controls** on chat (rate limits, token budget), because chat is open-ended in a way the current flow isn't.

## 8. Decisions needed from the owner before building

1. **Pricing:** is the chat free? Options: (a) free chat, paid deep assessment as today (recommended: chat becomes the funnel into the $149 assessment); (b) limited free messages, then paid; (c) folded into the Growth Intelligence subscription (brief of Oct 28).
2. **Front door:** does chat replace the current Library and question page as the main entry, or sit beside it? Recommended: chat becomes the Overview's first thing, and the Library stays as "deep assessments".
3. **Compensation and equity data:** what's the source for pay and equity ranges (licensed survey, your own advisory data, public reports)? Without one, answers to starters 4–5 are clearly labelled estimates.
4. **Coming-soon questions:** should "Are we ready to raise our next round?" (Series A/B ready) go live through chat now?
5. **Consent wording** for shared learning, in the terms.
6. **Who's first in the Studio:** you only, or named CROs? This sets whether Phase 3 needs invites on day one.

## 9. Recommendation: now vs. later

**Build now:** Phase 1a, then Phase 2's version stamping and feedback/outcome capture. They're small, and they mean every conversation from day one produces structured learning data.

**Next:** Phase 1b topics as decisions 3–4 are answered, then the Studio MVP (Phase 3).

**Later:** the Phase 4 Studio features, MCP/ChatGPT/Claude apps, CRM integrations, vector search and aggregated benchmarks, each when there's real usage or data to justify it.
