# Rally product audit and release plan (Nov 25, 2026)

Source: "Rally Product Audit & Implementation — Incorporating Customer Feedback" (Ben Carcio's
Nov 25 walkthrough), Parts 1–8. This is the pre-development deliverable (Part 8): architecture,
inventory, gap analysis, backlog, UX changes, risks. No code has been changed for it yet.

Every finding below was checked in the code or the production database, not inferred from the UI.

---

## 1. Architecture summary

| Layer | What it is |
| --- | --- |
| App | Next.js 16 App Router, server components and server actions. One app serves founders (Rally), staff (`/advisor`), public pages (landing, `/network`, legal). Deployed on Vercel: `dev` → dev.growthgoaled.com, `main` → app.growthgoaled.com. |
| Data | Neon Postgres through Drizzle. 57 tables, 48 additive migrations, run on every deploy. |
| Auth | Neon Auth (Better Auth): email magic links, Google. Our `users` row is created on first sign-in (`lib/auth/session.ts`); roles founder / advisor / admin. |
| AI | Anthropic via `lib/ai/*`. One structured call per conversation turn (`lib/ai/chat.ts`), output validated with zod: reply, follow-up questions, extracted facts, an optional recommendation card, the intelligence records it used. Separate calls for plans, extraction, research, evals (LLM judge), CRO profile drafting. |
| CRO intelligence | `lib/cro.ts` (retrieval, prompt blocks), `lib/data/cro.ts`; tag and relevance scoring over validated records, no embeddings. |
| Voice | ElevenLabs (voice clones, text-to-speech, speech-to-text), browser speech recognition first. |
| Email | Resend (`lib/email.ts`) for every app email; Neon Auth's shared sender for sign-in links. |
| Payments | Stripe; hidden while `RALLY_BETA` is on (`lib/beta.ts`). |
| Tests | Vitest + PGlite (683 tests), Playwright end-to-end. |

## 2. Functionality inventory

| Area | What exists (where) |
| --- | --- |
| Landing | `/sign-in`, `/sign-up` → `RallyLanding`: headline, tagline, intro video, "what you can do / how to use it", CRO list, Beta access form, website chat (`GuestChat`), sign-in. |
| Website chat (pre-sign-up) | `lib/guest/steps.ts`, `lib/data/guest.ts`: challenge → name → company → revenue → founded year → stage → vertical → AEs → BDRs → CS, then a recommendation, blurred until an email is given; claimed into an account on sign-in (`/claim`). |
| Onboarding | `/welcome`: name, title (optional), company name, revenue, founded year, stage, vertical, AEs (required), BDRs, CS. Pre-filled from the website chat. |
| Company context | `companies` (stage, revenue band: nullable), `intake_responses`, `data_points`, `documents`, `company_facts` (extracted by the AI each turn, stated vs assumption, founder can correct or remove; "never asked twice"), company website profile (logo, about). Fed to every turn by `lib/chat/context.ts` with earlier conversations and open work. |
| CRO profiles | `cro_profiles`: name, headline, photo, bio, career history, accomplishments, industries, stages, company types, functions, expertise, philosophy (10 sections), communication style (8 traits), status, in Collective, linked login, voice. |
| CRO intelligence | `cro_intelligence` (12 types, evidence level, modes individual / collective, draft → submitted → validated, never self-validated), contributors (author, co-author, endorses, disputes), AI-flagged conflicts, training workbook import, corrections, evals with an LLM judge, quality report. |
| Individual vs Collective | Individual: that CRO's profile + only their records, says when they don't cover it. Collective: best records across Collective CROs, disagreements passed in, one synthesized answer that names where CROs differ ("Where our CROs see it differently"). |
| Engaging CROs | Entry screen dropdown (Collective or a CRO), company default CRO, switch perspective inside a conversation (each answer credited), "Second opinion" from the Collective, "Strongest on this" matching, CRO directory `/cros`, CRO page `/cros/[slug]` with its own ask box, public `/network`. |
| Conversations | `conversations` (+ `cro_id`), `conversation_messages` (credited CRO, intelligence used, second opinion flag). Persisted; continue any time; rail shows 8 recent, home lists 50; "Continue" for last week's. |
| Recommendations | `recommendations` (card with takeaway, diagnosis, evidence, confidence, 30/60/90, trade-offs, alternatives, perspectives, sources; status proposed / committed), founder feedback, per-answer helpful rating. |
| Decide → Execute → Monitor | "Commit to this" turns a card's next steps into `commitments` (owner, due date) in a `growth_projects` project; projects pages; commitment outcome (worked / partly / didn't) and notes; weekly check-in email and `/checkin`; advisor weekly priorities; approved project results; performance KPIs; paid action plans with targets (hidden in Beta). The AI sees open work and outcomes and refers back to them. |
| Admin | Advisor console: portfolio, users, CRO network and intelligence library, evals, quality, Beta metrics, CRM, reference data. |
| Navigation | Rail: New conversation, Recent, "Your company" (collapsed: profile, team, overview, projects, data, performance, documents, Our CROs), Share feedback. Top bar: company switcher, user menu. |

## 3. Production reality check

- **One published CRO.** Ryan Spillane, 59 validated records. Zero network positions, no other CRO
  profiles. The Collective today is one person's intelligence, so "different perspectives" can't
  show yet whatever the software does. This is the main dependency for Part 2 C and D.
- Sign-in emails come from **"Neon Auth" <auth@mail.myneon.app>** (the auth provider's shared sender).
- The founder screens say **"Growth Goaled Collective"** in about 35 places.

## 4. Gap analysis

Key: **Exists** · **UX** improvement · **Enh**ancement · **New** development · **Future** architecture.
Complexity S / M / L. Priority P1 (Release 1) / P2 (Release 2) / P3 (Release 3).

### Access and onboarding (B)

| # | Gap | Class | Today → Change | Why | Implementation | Deps | Cx | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | One CTA | UX | "Get early access" heading + "Get Free Beta Access" button + chat + sign-in compete → one "Get Access to Rally" button; "Rally (Beta)"; one line saying you can try it and make an account | Ben found access confusing | Copy and layout in `RallyLanding`, `MagicLinkForm` sent state | none | S | P1 |
| B2 | Branded sign-in email | Enh | Shared "Neon Auth" sender → "Rally by Growth Goaled" from your domain | Trust; Ben noticed | Neon Auth custom SMTP through Resend (smtp.resend.com). **Ryan enters the Resend key in the Neon console** (secrets stay out of chat); I set sender name/address and test | Resend domain verified | S | P1 |
| B3 | Onboarding fields | Enh | Website chat and Step 2 require revenue, founded year, stage, 3 headcounts → ask only name, company, role, vertical, challenge | Value before sensitive data | Shorten `GUEST_STEPS`; new light schema for `/welcome`; store role in `users.title`; challenge starts the first conversation. Revenue / stage / team become optional facts | B4 | M | P1 |
| B4 | Progressive collection | Exists (mostly) | Prompt already gathers minimum context and never re-asks; facts are extracted and kept → make it ask for revenue / stage / team when an answer depends on one, and write them back to the company | Keeps answer quality without front-loading | Prompt rule + map extracted facts (revenue band, stage, AEs…) onto `companies` / intake; context, benchmarks and plans tolerate nulls (audit each reader) | none | M | P1 |

### Simplify (A)

| # | Gap | Class | Today → Change | Why | Implementation | Deps | Cx | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Landing copy | UX | Headline, tagline, paragraph, two-column explainer, CRO list, access paragraph → "Meet your CRO collective." + "Experienced operators. Different perspectives. Better growth decisions." + CTA + CRO faces; explainer behind "How Rally works" | Too much text | `RallyLanding` | B1 | S | P1 |
| A2 | Home / entry copy | UX | Long helper text, footer disclaimer paragraph on every conversation → one line, details in a "How Rally works" disclosure | Scannable | `RallyEntry`, chat page footer | none | S | P1 |

### CRO collective as the centrepiece (C)

| # | Gap | Class | Today → Change | Why | Implementation | Deps | Cx | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Choosing who to ask | UX | A `<select>` above the question → a row of cards: "Rally Collective" first, then each CRO (photo, title, top expertise); picking one sets who answers | The collective must be the product, not a dropdown | `RallyEntry` (existing `croId` state and hidden field stay) | none | M | P1 |
| C2 | CRO profile page | UX/Enh | Has name, bio, expertise, "How {name} thinks", ask box → add "Questions {name} can help with" (from their top records' titles/expertise), clear "AI built on {name}'s documented expertise, not {name} live" | Part 4.2 | `/cros/[slug]`; example questions derived from validated records (no new table) | none | S | P1 |
| C3 | Whose intelligence | Exists | "Informed by", credited answers, CRO header in conversation | — | keep | — | — | — |
| C4 | Switch without losing context | Exists | Switch perspective keeps the conversation; each answer credited | — | keep; make the control more visible (C1 styling) | — | S | P1 |
| C5 | Conversations per CRO | Enh | One flat list → filter chips (All · Collective · each CRO) on the conversation list; CRO page lists "Your conversations with {name}" | Part 2 C.6 | `listConversations` gets an optional `croId`; UI only | none | S | P1 |
| C6 | Distinct, un-homogenized CROs | Exists (software) / **content gap** | Individual mode uses only that CRO's records and style → needs more CROs with real libraries | Without a second CRO there's no perspective | Recruit and load CROs (workbook import exists) | people | — | P1 (business) |

### Multi-perspective intelligence (D)

| # | Gap | Class | Today → Change | Why | Implementation | Deps | Cx | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Independent perspectives | New | Collective = one call synthesizing everyone's records; second opinion = one call → "Compare perspectives": the 2–3 best-matched CROs (`matchCros`) each answer **independently** in individual mode (parallel calls, own records, own style), then a **synthesis call** that sees only their structured outputs and produces agreement, disagreement (with assumptions), synthesis, recommended action | Part 2 D; not "combined LLM responses" | New `perspectives` step in `lib/ai`, a `perspective_runs` record (or messages with a `panel_id`) so each view stays attributed and stored; UI as a panel in the conversation | C6 (≥2 CROs with records); cost/latency budget | L | P2 |
| D2 | Agreement / disagreement | Enh | Collective card has `perspectives` from records' disputes → structured agree / differ sections from D1 | | part of D1 | D1 | M | P2 |

### Outcomes (E)

| # | Gap | Class | Today → Change | Why | Implementation | Deps | Cx | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | Decide: record a decision | Enh | Recommendation status proposed/committed; no explicit decision → "Record decision" (what we decided, why, date, revisit by) on a recommendation | Decisions to revisit | Extend `recommendations` (decision note, decided_at, revisit_on) — additive migration | none | M | P2 |
| E2 | Saved recommendations / decisions area | New (UI) | Data exists, no founder page → "Decisions" page: saved recommendations, decisions, linked plan/commitments, revisit dates | Part 2 F | New page over existing tables | E1 optional | M | P1 (list) / P2 (decisions) |
| E3 | Execute: plans, tasks, owners, milestones | Exists | Commit to this → commitments with owner/due in projects; paid action plans hidden in Beta | | Re-enable a light plan in Beta? (decision for Ryan) | pricing | — | P2 |
| E4 | Monitor | Exists | Check-ins, outcomes, KPIs, performance | | Link from Decisions page | E2 | S | P2 |

### Conversation UX (F)

| # | Gap | Class | Today → Change | Cx | Pri |
| --- | --- | --- | --- | --- | --- |
| F1 | Suggested questions below the input | UX | Above it in `RallyEntry` → move below | S | P1 |
| F2 | Buttons say what they do | UX | "Ask", "Continue", "See the full reasoning", "Second opinion"… → audit labels; icon buttons get text | S | P1 |
| F3 | Save vs commit | UX | `CommitToThis` has "Save this recommendation" and the commit form together → two clear actions: **Save recommendation** (bookmark, goes to Decisions) and **Commit to this** (makes tasks with owners and dates); conversations save automatically (say so once) | S | P1 |
| F4 | Company context collapsible | UX | `CompanyBrandBar` on company pages; "What Rally remembers" already a disclosure → make the bar collapsible, remember the choice | S | P1 |
| F5 | Logo goes home | UX | `RallyLogo` in the sidebar isn't a link (and no logo on mobile) → link to `/whats-next` | S | P1 |
| F6 | Navigation | UX | Rail: New conversation, Recent, Your company → add "Rally Collective & CROs" and "Decisions" at top level; Recent shows the CRO face per conversation | S | P1 |
| F7 | Consistent type / spacing | UX | Mixed `text-sm`/`text-base` helper text, mixed headings → one pass on entry, conversation, CRO pages | M | P1 |
| F8 | History and continue | Exists | keep | — | — |

### Brand (Part 1)

| # | Gap | Class | Change | Cx | Pri |
| --- | --- | --- | --- | --- | --- |
| R1 | "Growth Goaled Collective" → "Rally Collective" | UX | ~35 strings in founder UI and the AI prompts (`COLLECTIVE_RULES`); Growth Goaled stays as "by Growth Goaled", legal and emails' sender company | S | P1 |

### External AI distribution (G) — Future, not built now

What already helps: all intelligence access goes through two functions (`retrieve` in `lib/cro.ts`
and the chat turn in `lib/data/chat.ts`), scoped by company and CRO, with validated-only and
published-only rules in one place. What it would take:

1. **A service layer API** (`/api/v1`): `ask(company, cro|collective, question)`, `perspectives(...)`,
   `list_cros`, `get_cro`, `company_context`, `recommendations`. Today these are server actions bound
   to the cookie session; the logic is reusable, the transport isn't.
2. **Auth for agents**: OAuth 2.1 with per-user consent (Neon Auth/Better Auth has an OAuth provider
   plugin) or scoped API keys per company; scopes read:cros, ask, read:company, write:decisions.
3. **MCP server** over the same API (tools: `ask_rally`, `ask_cro`, `compare_perspectives`,
   `list_cros`, `my_decisions`), remote HTTP transport, the OAuth above.
4. **Controls**: rate limits and cost caps per key, audit log (`events` exists), attribution kept in
   every response, CRO consent for external distribution, no raw record export.

## 5. Learning and improvement (Part 5) — what exists and what's missing

Exists: adding CROs and records, workbook import, corrections, conflict detection, validation by
another CRO (never self), evals with an LLM judge and rubric, per-answer and per-card feedback,
quality report. Individual and collective knowledge are separate by design (modes per record,
network positions with no primary CRO).

Missing (P2): **capture insights from conversations as draft records** — never automatic. Proposed:
an advisor action "Propose as intelligence" on a conversation turn creates a *draft* record for the
answering CRO, stripped of company identifiers, which goes through the existing validation. Needs a
consent line in the founder terms before any founder content is used.

## 6. Prioritized backlog

**Release 1 — experience (implement now)**

1. B1 + A1: landing: "Meet your CRO collective", one "Get Access to Rally" CTA, explainer behind a disclosure.
2. B3 + B4: onboarding to name, company, role, vertical, challenge; revenue / stage / team asked in conversation when needed; every reader tolerates their absence.
3. R1: "Rally Collective" everywhere in the founder UI and prompts.
4. C1 + F1: home: Collective and CRO cards to pick who to ask; suggested questions below the input.
5. F3 + E2 (list): Save vs Commit made distinct; a "Decisions" page listing saved and committed recommendations.
6. C2 + C5: CRO page example questions and "AI built on…" line; conversations filterable by CRO.
7. F5 + F6 + F4: logo → home, rail reorganized, company bar collapsible.
8. A2 + F2 + F7: copy trim, button labels, type and spacing pass; mobile check.
9. B2: branded sign-in email (Ryan's one step in the Neon console).

**Release 2 — collective intelligence and outcomes (after review)**

1. C6: onboard at least two more CROs with libraries (business dependency).
2. D1 + D2: Compare perspectives (independent CRO reasoning → structured synthesis).
3. E1: record a decision (decision, why, revisit date) on a recommendation.
4. E3 + E4: plan / tasks / milestones in Beta; Decisions page links to progress and check-ins.
5. Draft intelligence from conversations, with consent and validation.

**Release 3 — distribution (design only)**: API, agent auth, MCP server, as in section 4 G.

## 7. Proposed UX changes (Release 1)

- **Landing**: Rally (Beta) logo → "Meet your CRO collective." → "Experienced operators. Different
  perspectives. Better growth decisions." → email + **Get Access to Rally** ("Free while in Beta. Try
  Rally and create your account.") → CRO faces → video. "How Rally works" and "Ask a question first"
  as disclosures; "Already have access? Sign in" as a link.
- **Home**: "Who do you want to ask?" with a Rally Collective card and CRO cards → big question box
  (type or talk) → suggested questions under it → "Continue: {last conversation}" → conversation list
  with CRO filters. "What Rally remembers" stays collapsed.
- **Conversation**: CRO header (as now) with a clearer switch; answers; input; under the latest card
  two buttons: **Save recommendation** and **Commit to this**; one-line footer.
- **Rail**: logo (home) · New conversation · Rally Collective & CROs · Decisions · Recent (with faces) · Your company · Feedback.

## 8. Technical risks and dependencies

- **Optional basics**: `companies.revenue_band` is nullable, but intake, peer benchmarks
  (`cohort-match`), plan inputs and some advisor views assume a stage / revenue. Each reader needs a
  null path; tests cover the main ones. Existing companies keep their data.
- **Single CRO in production**: Collective and Compare views will look thin until more CROs are loaded.
- **Branded email** depends on Resend domain verification and Ryan entering the key in Neon.
- **Compare perspectives cost/latency**: 3 independent calls + synthesis ≈ 4× a normal turn; needs
  streaming or a progress state, and a per-company daily cap.
- **No destructive changes** planned: migrations additive, no tables dropped, existing conversation,
  recommendation and commitment data untouched.

---

## 9. Release 1: what was built (Nov 25, 2026)

| Backlog item | Done | Where |
| --- | --- | --- |
| B1 + A1 Landing | "Meet your CRO collective." + promise line + CRO faces; one **Get Access to Rally** button (also in the website chat and `/network`); "How Rally works" and "Or ask a question first" as disclosures | `app/(auth)/RallyLanding.tsx`, `components/brand/Rally.tsx` (`RALLY.promise`, `RALLY.cta`) |
| B3 Onboarding | Website chat asks challenge → name → company → role → vertical. Company step asks name, role, company, vertical, optional challenge; stage, revenue, founding year and team behind an optional disclosure. Role saved to `users.title`; the challenge waits in the home question box | `lib/guest/steps.ts` (`LATER_STEPS` keeps the old questions readable), `lib/onboarding.ts`, `components/onboarding/CompanyBasicsFields.tsx`, `app/welcome/*` |
| B4 Progressive collection | Prompt: ask for revenue / stage / team only when the answer depends on it, or answer conditionally; facts already persist | `lib/ai/chat.ts` |
| R1 Brand | "Growth Goaled Collective" → "Rally Collective" in founder UI, staff UI and prompts | many (string change only) |
| C1 + F1 Home | "Who do you want to ask?" cards (Rally Collective, each CRO with title and expertise), question box, suggestions under it | `components/chat/WhoToAsk.tsx`, `components/chat/RallyEntry.tsx` |
| C2 CRO page | "Questions {name} can help with" ranked by their expertise (`topicsFor`), AI disclosure line, "Your conversations with {name}" | `app/(founder)/cros/[slug]/page.tsx`, `lib/cro.ts` |
| C5 History by CRO | Filter chips (All · Rally Collective · each CRO) and who answered on each row; `?with=` preselects who to ask | `app/(founder)/whats-next/page.tsx`, `lib/data/chat.ts` (`listConversations` `cro` option) |
| F3 + E2 Save vs Commit, Decisions | **Save recommendation** (bookmark, `recommendations.saved_at`, migration 0049) and **Commit to this** (unchanged commitments flow) side by side with one line explaining each; new **Decisions** page | `components/chat/CommitToThis.tsx`, `lib/data/decisions.ts`, `app/(founder)/decisions/page.tsx`, `saveRecommendationAction` |
| F5 + F6 Navigation | Logo → home (sidebar; Rally mark on phones); rail: New conversation · Home · Rally Collective & CROs · Decisions · Recent · Your company · Share feedback | `app/(founder)/layout.tsx`, `components/shell/RallyRail.tsx`, `lib/nav.ts` |
| F4 Company context | Company bar collapsible, remembered per browser | `components/brand/CompanyBrandBar.tsx` |
| A2 + F2 Copy | Conversation footer one line; CRO directory "Meet your CRO collective" with **Ask {name}** / **View profile** | chat page, `app/(founder)/cros/page.tsx` |
| CRO roster | James Winn added as a draft CRO, linked to his advisor login, in the Collective once published | production data |

Preserved: authentication and the website-chat claim, conversation persistence and continuation,
switching perspective, second opinion, commitments, projects, check-ins, intelligence retrieval and
attribution, voice, Beta pricing switch, every staff tool. Migration 0049 is additive.

QA: `e2e/rally-journey.spec.ts` runs the brief's 13-step journey on a 1440×900 desktop and a 390×844
phone (including no sideways scroll); the existing suites were updated for the new controls.

Outstanding for Release 1: branded sign-in email (Neon Auth custom SMTP via Resend: needs the key
entered in the Neon console).
