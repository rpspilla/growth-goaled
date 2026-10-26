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

## Data step (simplified per use case)
- [ ] `/data` title is "Data for <use case>"; no mention of benchmark; tabs are only What we need / Files / Needs your answer
- [ ] Items are only the active use case's, in three groups: **Needed for the assessment**, **Sharpens it**, **Optional extras**; each card has a "Why it matters" line for this objective
- [ ] Switch use case in the sidebar → the list and reasons change (shared items keep their status and files)
- [ ] Status buttons save (Available / Partially / Missing / N/A); "Details" opens source system, coverage, quality, limitations, notes
- [ ] **Ready for analysis** meter: "N of M required items in", turns green with "Ready" when all required items are in
- [ ] Growth Leak: "Analyze my data" is disabled until ready, then goes to Results; other use cases say an analyst will prepare the results
- [ ] Upload a **CSV** and an **XLSX**: status goes reading → read, columns / rows / date range shown, missing-column warning when a needed column is absent
- [ ] Upload a **PDF**: extracted values appear as proposed; accept / reject works
- [ ] Old category links (`/data/financial` etc.) land on `/data`

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

## Self-service pricing and customer journey
- [ ] Stripe on staging: test keys in Vercel Preview; webhook `https://dev.growthgoaled.com/api/stripe/webhook` sends `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
- [ ] New founder lands on **Overview**: "Pick a question, get a free Snapshot" highlighted; Data and Results greyed with "Unlocks when you buy an assessment"
- [ ] **Library**: six cards with the question, the problem, "For: …", key outputs and "Explore assessment"; all six show "Free Snapshot · Assessment $499"
- [ ] Open a card: who it's for, what you'll receive, **$499** price box, how it works, data we may ask for. No payment prompt anywhere on this page
- [ ] Questionnaire: only the challenge, stage and sales model are required; profile questions you've already answered are listed ("From your company profile…") instead of asked; answers save on blur and survive a reload
- [ ] "See my free Snapshot": **Hypotheses** banner, "Is this the right assessment?" (try Series A readiness while at Series A → suggests Series B), signals each with "Based on: your answer…", and the data it would take to confirm. Stripe dashboard shows no charge so far
- [ ] "Get the full assessment · $499" → Stripe test checkout (4242 4242 4242 4242) → lands on **Data** for that assessment
- [ ] Cancel at checkout → back on the Snapshot with "Payment cancelled. Nothing was charged"; Data still locked
- [ ] Declined card (4000 0000 0000 0002) → Stripe shows the error; nothing unlocks
- [ ] Click the buy button twice quickly, or come back and click again within a day → the same Stripe checkout opens (one pending payment in Stripe, not two)
- [ ] After paying, the Snapshot page shows "You have this assessment · continue" instead of a buy button
- [ ] Buy and run **at least two different use cases** (e.g. Growth Leak and Hire or Fix): Data shows that use case's items; "Analyze my data" unlocks once the required ones are in → Results ("Analyzing your data…", then results in a few minutes)
- [ ] **Results** is a Decision Brief with nine numbered sections (Executive decision, Where you are now, Diagnosis, Evidence/assumptions/confidence, Options, Recommendation, 30–90 day plan, What would change this recommendation, Follow-up); each statement's "Evidence →" opens the Source Trail, including "Your answer" and "Calculated from your data" entries; numbers match what you entered or uploaded
- [ ] **Calculated figures**: upload a CSV of MRR by customer by month (customers down, months across, 13 months) → on Results, "Where you are now" shows ARR, NRR, GRR, new/expansion/churned ARR marked "Calculated from your file" with the period and method in words; section 4's "Calculations from your files" shows the ARR bridge; check one NRR by hand ((start + expansion − contraction − churn) ÷ start)
- [ ] With a revenue-by-customer file showing churn bigger than new business, the Diagnosis names lost revenue from existing customers, with a certainty chip (Established / Leading explanation / Not yet established) and a "Fastest test"; with too little data it says "Not yet established" rather than picking a cause
- [ ] Plan actions show Who only when the brief can tell (otherwise "Your call"), and the signal to look for is labelled "(proposed)"
- [ ] **Commit to this plan** → "You committed to this plan on …" with "Track progress →"; step 5 unlocks; Progress lists the actions (change a status to Done and add a note → it persists after reload), the tracked metrics' baseline, and "Reassess by <date>"
- [ ] Upload newer data (or confirm a changed figure) → Progress shows it as changed since your brief and the metric's latest value vs baseline (▲ Improving / ▼ Worse); "Reassess now" builds a new version and Progress stays unlocked; the new brief's "Last brief" column shows the previous values
- [ ] Admin: company → step 5 shows the committed plan read-only with statuses and notes
- [ ] With **no matching peer reference data**, results still appear and say plainly that no peer reference is available; with a matching approved cohort, peer median / top quartile columns appear
- [ ] **Missing or unreadable data never breaks it**: buy an assessment, share only one required item (and a file that can't be read, e.g. a .key), press "Analyze what I've shared" → a report still appears with a "Built as far as your data allows · N gaps" banner listing what's missing, and "Book time with an executive advisor to review it" opening your Calendly page
- [ ] **Data discrepancies**: enter NRR 94 in Company profile, then upload a spreadsheet that says 101% → on Data and Results, **Check your figures** opens with "Values disagree" and both values with their source; "Use this one" on either → it says Confirmed, the profile shows the chosen value, and the open conflict question under Needs your answer is closed
- [ ] **Missing figures**: a figure the assessment needs that nobody has given shows "Missing" with a box; type e.g. "$500K" or "94%" → saved (to the profile where it has a field); then "Re-run with these figures" → the new results use them
- [ ] Before you choose, a re-run lists the disagreement as a gap ("NRR has different values (94% in your company profile vs 101% in …)")
- [ ] **Complete data**: all required items in and figures confirmed → no gap banner, a sequenced action plan aimed at the underlying issue (e.g. retention), and the end card recommends a **monthly call with an executive-level advisor** ("Book your monthly call" → Calendly)
- [ ] Add or confirm a figure, then "Re-run with my latest data" → a new version replaces the old one when ready (the old one stays visible meanwhile)
- [ ] Admin: company → Results step shows the same results, the QA checks, and "Mark reviewed" (with a note) → founder sees "Reviewed by …" and the note
- [ ] One advisory card at the end ("From $750", "Explore advisory support"); results stay fully visible whether or not you use it
- [ ] Advisory page: request a session → "We'll email you…"; a second request the same week says you've already asked; admin sees it on the company's Overview
- [ ] With `ADVISORY_BOOKING_URL` set in Vercel, the advisory page shows "Choose a time" and opens that page
- [ ] **Your assessments** (top right): one row per question with purchase status, status, started/completed dates and a link (Open for bought ones, Snapshot otherwise)
- [ ] Admin: company → Library step → "Grant without payment" (with a note) gives the founder that assessment; history shows "Granted by your advisor"
- [ ] Change `ASSESSMENT_PRICE_CENTS` in Vercel (e.g. 59900) and redeploy: cards, price box, buy button and the Stripe checkout all show the new price
- [ ] Phone width: the menu button opens the steps; library, Snapshot and Results are readable without sideways scrolling (tables scroll inside their card)
- [ ] Analytics (admin): `library_viewed`, `use_case_viewed`, `objective_saved`, `snapshot_viewed`, `checkout_started`, `use_case_activated`, `advisory_requested`

## Preliminary results (Growth Leak)
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
