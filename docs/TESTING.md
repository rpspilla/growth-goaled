# Manual test list (staging: dev.growthgoaled.com)

Things that need a person to click through, because they depend on real sign-in, email, file uploads or paid Claude calls that automated tests stub out. Updated at every milestone. Tick items off as you go.

Use two browsers (or a private window): one signed in as **admin** (ryan@growthgoaled.com) and one as a **test founder** with a different email.

## Setup notes
- Each AI step (extraction, gap summary, research, draft, QA) is a paid Claude call.
- Research needs **web search enabled** for the Anthropic organization (Console → settings).
- Founder figures entered in the company profile count as *accepted*; figures read from files are *proposed* until accepted.

## Sign-in and onboarding (M1, M3)
- [ ] Founder sign-up with magic link lands on `/welcome`, not a loop
- [ ] `/welcome`: name, title, company, website, **Annual Revenue** buckets (<$1M … $20M–$50M); then lands on the dashboard
- [ ] New company appears in admin's `/advisor/unassigned`; claim it (admin can assign to another advisor)
- [ ] Advisor invite: invite an email to a company, the email arrives (Resend), the link signs them in to that company
- [ ] Signed-out visits to founder or advisor pages go to sign-in

## Company profile / intake (M4)
- [ ] Answers autosave on blur and survive a reload
- [ ] % complete updates; at 100% the "Data Readiness →" button appears and the phase moves on
- [ ] Numeric answers (ARR, growth, NRR, sales cycle…) show on the dashboard

## Data Readiness (readiness rework)
- [ ] Six categories A–F, each item's status buttons save (Available / Partially / Missing / N/A)
- [ ] Item details save: source system, method, coverage months, quality (founder can't pick Validated), limitations, notes
- [ ] Upload a **CSV** and an **XLSX** into an item: status goes reading → read, columns / rows / date range shown, missing-column warning when a needed column is absent
- [ ] Upload a **PDF** (board deck or financial model): extracted values appear as proposed; accept / reject works
- [ ] Upload a **DOCX**: shows "stored, not analysed automatically"
- [ ] Upload the **same file twice**: second time says it linked the existing copy; only one file listed
- [ ] Rejected formats (.pptx, .xls) show the export-as message
- [ ] Overview: three separate panels (collection / quality / analytical), next-step card, metrics list, quality concerns
- [ ] "Summarise gaps" produces an AI summary grounded in the checks (no figures); "data changed" note after edits
- [ ] "Send to my advisor for the benchmark" stays disabled until blockers are cleared, then goes to `/processing`

## Questions and registers (M6)
- [ ] Upload a file whose figure differs >10% from the profile (e.g. different sales cycle) → a conflict appears on `/questions`
- [ ] Resolve the conflict by choosing a value → dashboard shows the chosen value
- [ ] "Enter the correct value", "Answer", "Use uploaded data", "Mark as unknown" each close an item and show in Answered
- [ ] Admin `/advisor/registers`: filters work; add an item "Ask the founder" → founder sees it immediately; reopen a closed item

## Benchmark library (M7)
- [ ] Create a cohort (stages, ARR 2M / 10M style input, model, GTM motion); edit it
- [ ] Download the CSV template, fill a few rows, import → rows appear as Proposed; bad rows listed by line
- [ ] Approve a row, approve a second row for the same metric/period → first is retired automatically
- [ ] Retire, "Back to proposed", Discard
- [ ] "Research public benchmarks" (a few minutes): proposed rows with clickable sources; dropped results listed; Sources tab shows them
- [ ] Sample cohort is read-only

## Benchmark deliverable (M8)
- [ ] With an approved cohort matching the test company, founder sends data → `/processing` shows Drafting → QA → Advisor review
- [ ] Admin `/advisor/review`: item shows "Review now"; review page shows both agents complete, five QA checks, missing inputs, draft preview
- [ ] Founder `/benchmark` still shows "being prepared" (no draft visible)
- [ ] Request changes: edit text, save → new version goes through QA again
- [ ] Send back to AI with a comment → new version addresses it
- [ ] Approve, then Publish → founder `/benchmark` shows it with the approval note; source trail panel opens for rows and insight
- [ ] Generate with no matching approved cohort → version fails with a clear reason, "Start a new draft" works

## Advisor portfolio and company view (M9)
- [ ] `/advisor/portfolio`: five counts match reality; table shows ARR, growth, health, phase, data %, questions, benchmark status; red dot on companies needing attention
- [ ] Click a company → `/advisor/companies/[id]`: metric cards, score, benchmark position (published, or draft labelled "draft"), phase, readiness numbers
- [ ] Set health (On track / Watch / At risk) → shows in the portfolio table
- [ ] Write and save the advisor summary; it is **not** visible anywhere on the founder side
- [ ] "To validate": Validate a founder item → founder's item shows Validated (and founder editing it resets to Unverified)
- [ ] "Required gaps": send a Request → founder sees "Advisor request" on that item in Data Readiness and it drives the "most useful next step"
- [ ] Open questions and files lists match the founder's

## Analytics and hardening (M10)
- [ ] Admin `/advisor/analytics`: tiles fill in as you go through the lists above; event counts go up (e.g. open a source trail, then reload)
- [ ] Advisor (non-admin) can't open `/advisor/analytics` or `/advisor/users`
- [ ] Automated: `npm run test:e2e` passes locally (already run in development; re-run after changes)

## Production (before launch)
- [ ] Neon Auth provisioned on the **main** branch, trusted domain app.growthgoaled.com, magic link enabled
- [ ] Vercel production env: NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET (others already set)
- [ ] Seed portfolio does not appear in production
