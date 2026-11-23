# Build brief: AI CRO sprint (P0.1–P0.3)

Source: the AI CRO Product Audit (Nov 23, 2026). Evolve, don't rebuild: put the conversation at the
front door, let it see the work, and let it create the work.

## Rules

- Reuse what exists: `lib/ai/chat.ts`, `lib/chat/context.ts` (`chatContext()`), `startConversation`,
  `growth_projects`, the Overview and project pages. No new AI agent, no queue, no vector store.
- One new table (`commitments`), two new columns on `growth_projects` (`conversation_id`,
  `recommendation_id`), one on `recommendations` (`status`). Additive migration only.
- Every new server action calls a guard (`founderCompany()` / `managed()`); `tests/permissions.test.ts` must pass.
- Unit tests (PGlite) for the data layer; one end-to-end spec for the full loop; update specs the menu change breaks.
- Small commits on `dev`; README updated. Do not touch `main`.

## P0.1 Conversation-first home (small)

- The Overview opens with **"What are you working through?"**: a free-text box that starts a
  conversation (topic "other" + the founder's words) and lands in it; the starter questions sit
  under it as chips; open conversations (latest 3) to resume.
- The menu's conversation item is renamed **Ask your CRO** (still `/whats-next`) and moves first.

Acceptance: a founder types a question on the Overview and lands in the conversation, answered; the
menu lists "Ask your CRO" first; existing specs pass with the new order.

## P0.2 One company context (medium)

`chatContext()` adds, compactly:

- open growth projects (name, started, where they came from) and recently completed ones;
- the founder's commitments: open ones (title, owner, due, measure, overdue flag) and the last few
  closed ones with their status;
- this week's advisor priorities;
- approved project results;
- earlier conversations (latest 10 other than this one): title, date, and the latest recommendation's
  takeaway and whether it was committed.

The legacy `plan_actions` read is dropped. The CRO prompt gets a rule for OPEN WORK: refer to it,
don't re-recommend what's already committed, ask briefly about overdue commitments when relevant.

Acceptance: with a project, a commitment and a priority on file, the context includes all three;
the prompt mentions them; tests cover the builder.

## P0.3 Commit to this (medium)

- Under the latest decision card: **Commit to this**. It opens a short form prefilled from the card:
  a growth project (new, named from the card's takeaway, or an existing open one) and up to five
  commitments from `next_steps`, each with owner (default the founder), due date (a week apart),
  and a success measure (from `success_measures`). The founder edits, unticks, and saves.
- Saving creates the project (if new, linked to the conversation and recommendation), the
  commitments, and marks the recommendation **committed**. A committed card says so and links to the
  project instead of the button.
- Overview: **Your commitments** (open, soonest due first, overdue marked) beside the advisor's
  priorities; each can be ticked done (or dropped) from there. The project page lists its commitments.
- Advisor: the company's projects page lists each project's commitments and their status.

Acceptance: from a card, a founder creates a project with 1–5 commitments (owner, due, measure); they
appear on the Overview, the project page and the advisor's projects page; ticking one done updates
everywhere; the next conversation's context includes them; permission tests cover the new actions.

## Out of scope

Weekly check-in emails, outcomes, advisor approval of commitments, guest-chat import, removing the
legacy use-case code, integrations.
