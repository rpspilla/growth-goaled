# Multi-CRO intelligence: how the brief maps onto the build (Nov 23, 2026)

Source: "Growth Goaled — Multi-CRO Intelligence Architecture, Integration Requirements for the
Existing Build", sections 1–5. Section 6 (Website & Founder Experience Integration) arrived cut off
after its heading, so only what sections 1–5 require of the founder experience is built.

Built into the existing app (no separate product, no new AI agent, no vector store).

## Data (migration 0037, additive)

| Brief | Built |
| --- | --- |
| CRO profile (identity, background, expertise, philosophy, behavioral profile) | `cro_profiles`: name, slug, headline, photo, bio, career history, accomplishments, tagged industries / stages / company types / functions / expertise, website, available for advisory, `philosophy` (10 sections), `style` (8 traits + an answer in their own words), `status` (draft/published), `in_collective`, linked login (`user_id`) |
| Intelligence record + metadata | `cro_intelligence`: the 12 types, category, title, content, tags, stages, industries, company types, expertise, primary CRO (null = network position), classification (individual / collective / multi), source, status (draft → submitted → validated / rejected / retired), evidence level (opinion / experience / case evidence / data), validated by + when, reviewed at, version, related records, modes (individual, collective) |
| Attribution, agreement, conflict | `cro_intelligence_contributors`: author, co-author, endorses (independently agrees), disputes (with the reason) |
| Attribution never lost in answers | `conversation_messages.intelligence_ids`; the card's `sources` (id + how it was used) and `perspectives`; `conversations.cro_id` (null = Collective) |

## Retrieval (`lib/cro.ts`, `lib/data/cro.ts`)

- Only **validated** records, only in the modes they allow, only from **published** CROs.
- **Individual**: that CRO's profile, their behavioral rules, then their most relevant records (theirs,
  co-written or endorsed). Nothing from the rest of the network.
- **Collective**: the most relevant records of CROs in the Collective plus network positions; scored on
  topic expertise, the question's words against tags and titles, stage and industry fit, evidence
  level; agreement adds a little, capped (relevance and evidence over headcount). Disputes among the
  chosen records are passed with who holds each view and why.
- The prompt (`intelligenceBlock`) gives each mode's rules: individual = an AI informed by the CRO,
  never them, nothing invented, say when their documented intelligence doesn't cover it; collective =
  synthesize, name material disagreements with their assumptions, recommend the view that fits,
  say what would change it. The model lists the records it used; any id it wasn't given is dropped.

## Who can do what

Admins create, publish and link CROs, keep them in or out of the Collective, write network positions.
A CRO (advisor login linked to a profile) edits their own profile, writes and submits their own
records, endorses or disputes others'. Another CRO or an admin validates; never the author. Founders
see published CROs only.

## Screens

- Advisor: **CRO network** in the sidebar: CROs (`/advisor/cros`, `/advisor/cros/[id]`) and the
  Intelligence library (`/advisor/intelligence`, `/advisor/intelligence/[id]`).
- Founder: "Ask: the Growth Goaled Collective / {name}'s AI CRO" on the ask box; the CRO directory
  (`/cros`) and each CRO's page (`/cros/[slug]`) with their own ask box; the conversation says who
  they're talking to; every card shows "Informed by" and, in the Collective, "Where our CROs see it
  differently".

## Sections 6–13 (Nov 24, 2026)

- **Engagement (0040):** company default CRO, switching within a conversation (each answer credited),
  second opinion, earlier conversations labelled with their perspective, "Strongest on this"
  expertise matching (`matchCros`), public pages `/network` and `/network/[slug]` deep-linking into
  the website chat.
- **Knowledge (0041):** training workbook import (`lib/workbook.ts`, `lib/data/workbook-import.ts`),
  corrections, AI-flagged conflicts with confirm/dismiss, contributions by CRO in the quality report.
- **Evaluation (0042):** `eval_scenarios`, `eval_runs`, `eval_results`; rubric in `lib/evals.ts`,
  judge in `lib/ai/judge.ts`, runs in `lib/data/evals.ts`, screens `/advisor/evals` and
  `/advisor/evals/[id]`.

## Not built

Embeddings (only if the library grows past what tag scoring handles); scheduled evaluation runs
(today they run while the page is open).
