# Manual test list (staging: dev.growthgoaled.com)

Things that need a person to click through, because they depend on real sign-in, email, file uploads or paid Claude calls that automated tests stub out. Updated at every milestone. Tick items off as you go.

Use two browsers (or a private window): one signed in as **admin** (ryan@growthgoaled.com) and one as a **test founder** with a different email.

## Setup notes
- **First:** in Vercel, `ANTHROPIC_API_KEY` must be the *full* key (one unbroken string starting `sk-ant-`, no "…"). Then as admin, Analytics → System checks → **Check AI connection** should say "Connected".
- Each AI step (extraction, gap summary, research, draft, QA) is a paid Claude call.
- Research needs **web search enabled** for the Anthropic organization (Console → settings).
- Founder figures entered in the company profile count as *accepted*; figures read from files are *proposed* until accepted.

## Sign-in and onboarding (M1, M3)
- [ ] Founder sign-up with magic link lands on `/welcome`, not a loop
- [ ] `/welcome`: name, title, company, website, **Annual Revenue** buckets (<$1M … $20M–$50M); then lands on Overview
- [ ] New company appears in admin's `/advisor/unassigned`; claim it (admin can assign to another advisor)
- [ ] Advisor invite: invite an email to a company, the email arrives (Resend), the link signs them in to that company
- [ ] Signed-out visits to founder or advisor pages go to sign-in

## Company profile / intake (M4)
- [ ] Answers autosave on blur and survive a reload
- [ ] % complete updates; at 100% the "Go to Data →" button appears and the phase moves on
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

## Upload whatever you have (inbox)
- [ ] Drag several files onto the drop zone at the top of `/data` (and also try click-to-choose); each shows uploading → "reading and sorting"
- [ ] A **messy single spreadsheet** with several tabs (P&L, customers, pipeline…): suggestions name the right items and sheets; confirm some, untick others → only confirmed items become Available (unverified) and the file shows "Supports: …"
- [ ] "It also covers…" adds an item by hand; "Doesn't cover any" clears the file from the review list
- [ ] A **PDF** board deck and a **screenshot** (PNG/JPG): suggestions appear and extracted values show on the Files tab
- [ ] A **.pptx / .xls / .key** file: uploads fine, shows "can't read this format… kept for your advisor", suggestions only from the file name
- [ ] Re-drop the same file: "already uploaded · using the existing copy"
- [ ] Paste a **Google Sheets** link shared "Anyone with the link can view" → imported as .xlsx, read and sorted, Files tab shows "Imported from Google ↗"
- [ ] Paste a **Google Doc** and a **Google Slides** link → imported as PDF and read
- [ ] Paste a link to a file that is **not shared** → clear "set sharing to Anyone with the link" message, nothing added
- [ ] A failed file shows "Try reading again"; a failed sort shows "Try sorting again"
- [ ] A file over 25 MB is refused with a clear message
- [ ] **Remove** a wrong file (from the sort review, the Files tab, and an item's file list): inline confirm, file disappears, values read from it disappear, items only that file supported go back to Not reviewed, items you'd added details to stay as they were

## U1 · Five steps, Overview, Use Case Library, per-use-case payment
- [ ] Stripe set up: `STRIPE_SECRET_KEY` (test key on staging) and `STRIPE_WEBHOOK_SECRET` in Vercel Preview, redeployed; webhook endpoint `https://dev.growthgoaled.com/api/stripe/webhook` for `checkout.session.completed`
- [ ] New founder: sign up → `/welcome` → lands on **Overview** (four connected steps, "You are here" on *Pick a use case*, one green button)
- [ ] Sidebar shows exactly five steps; **Data**, **Baseline** and **Progress & Tracking** are greyed with a lock and one line saying what unlocks them
- [ ] **Library**: six cards (question, when it's useful, what you get); *Recommended* on Series A Readiness + Growth Leak for a Seed / <$3M company, Growth Leak only for a later one
- [ ] Open a card → objective form + "What you get" + "Data we'll ask for" (required items in bold)
- [ ] Answers save on blur ("Your answers are saved…"), survive a reload, and show again after leaving and coming back; the target value has the *your target* label; bad number/date shows an error
- [ ] "Continue to payment · $1" stays disabled until the four required answers are in
- [ ] Pay with Stripe test card 4242 4242 4242 4242 → back on **Data** with "Use case: …" at the top; Data and Baseline unlocked in the sidebar
- [ ] Cancel at checkout → back on the form with "Payment cancelled" and answers kept
- [ ] Stripe dashboard → webhook shows a 200 for `checkout.session.completed`
- [ ] Overview now shows "Connect your data" and the use case with "Your target: …"
- [ ] Activate a second use case (pay again, or as admin) → a **switcher** appears at the top of the sidebar; switching changes "Use case:" on Data
- [ ] Old links redirect: `/dashboard` → Overview, `/readiness` → Data, `/questions` → Data › Needs your answer, `/intake/company` → Profile, `/benchmark` → Baseline (or Library with no active use case)
- [ ] **Company profile** link at top right opens the old profile sections
- [ ] With Growth Leak active, **Baseline** shows the preliminary / published benchmark as before (no separate $1 unlock any more); for other use cases a short "we'll build it once the data is in" note
- [ ] Admin: open the company from Portfolio → the founder's five steps in a second column; Overview lists use cases with their step and the founder's target
- [ ] Admin: **Use Case Library** step shows the founder's objective answers; "Activate without payment" needs a note and records who and why
- [ ] Admin: **Data** step has the item review, open questions and files; **Baseline** has the benchmark position and Generate / review link; **Progress** is a placeholder
- [ ] Your existing company (Harborview Compliance): if it paid the old $1 benchmark unlock, Growth Leak is already active
- [ ] Analytics (admin): `library_viewed`, `use_case_viewed`, `objective_saved`, `checkout_started`, `use_case_activated` appear

## Instant preliminary Benchmark (now inside Growth Leak's Baseline)
- [ ] An approved cohort matches the test company (Benchmarks page)
- [ ] With Growth Leak active, upload a file → once it's read and sorted, Data shows "Building your preliminary benchmark…" then "ready"
- [ ] Baseline shows the full preliminary report with the Preliminary banner; unconfirmed figures marked; "To complete your fully calculated report" steps link to the right places
- [ ] Advisor: Review Queue shows the version as "preliminary"; review page says whether the founder can see it; publishing a reviewed version replaces it for the founder
- [ ] Accept a figure or upload more → "Build it again" produces an updated preliminary report

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
