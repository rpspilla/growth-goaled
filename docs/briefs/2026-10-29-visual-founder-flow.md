# Brief: make the founder flow visual-first (Library → Action plan)

**Owner request, Oct 29, 2026.** "The founder view is still too wordy and full of text. I'd prefer a more image-centric view." Build on `dev` in the milestones below and stop for owner review after each. If the sample-demo or subscription briefs are in progress, finish the current milestone of that work first.

## Scope
Founder screens only, in journey order:
1. Growth questions library (`/library`)
2. Question page and questionnaire (`/library/[useCase]`)
3. Growth Snapshot (`/library/[useCase]/snapshot`)
4. Data (`/data`)
5. Results (`/baseline`)
6. Action plan (`/progress`)

Out of scope: Overview, advisor views, sign-up, billing. They should still look consistent with whatever shared components change.

## The problem today
- No charts anywhere between the Library and the Action plan (Recharts is installed but only used by the retired Benchmark view).
- Explanations are written out in full on the page: "who it's for", "you'll decide", "how we work with companies like yours", findings, evidence, points against, assumptions, staged plans.
- Numbers are mostly inside sentences, where founders have to read to find them.

## Design principles (apply to every screen)
1. **Show, then tell.** Each screen leads with one visual that answers "where am I / what did you find": a chart, a set of metric tiles, a progress ring or a timeline. Text supports the visual, not the other way round.
2. **Word budget.** Above the fold, ≤ 40 words on Library and question pages, ≤ 60 on Snapshot, Results and Action plan, not counting labels on charts and tiles. Any card's body text: one line, max ~15 words. Measure before and after and report it.
3. **Numbers are tiles or charts, never buried in a sentence.** A figure appears as a metric tile (value, label, small comparison or trend) or on a chart.
4. **Progressive disclosure.** Long explanations, evidence, assumptions, "points against", methodology and "how we work" move behind "Why?", "Show evidence" or "Details" toggles, or into the existing Source Trail panel. Nothing is deleted. Everything stays one click away and keeps its source trail.
5. **Icons over labels.** Add one consistent line-icon set (e.g. `lucide-react`) for data types, statuses, plan dimensions and actions. Statuses use colour + icon + short word, never colour alone.
6. **Same truth rules.** Charts only plot figures that already exist as data points or computed figures with a source. Every chart has a source-trail affordance. When data is missing, show a clear "Needs data" tile with an upload action, never a placeholder chart or invented numbers.
7. **Design system.** Use the existing tokens (green #155A3C, navy #0D1B2A, amber, red, blue, muted backgrounds, Instrument Serif headlines, Inter, JetBrains Mono for numbers). Chart palette from those tokens. Charts are accessible: labelled axes, value labels or tooltips, a text summary for screen readers, legible at 390px wide.

## Shared visual components to build first
- `MetricTile`: value, label, comparison (vs peer quartile or baseline), trend arrow or `Sparkline`, status colour. Extend the existing `components/ui/MetricCard.tsx` rather than duplicating it.
- `QuartileBar`: a horizontal bar showing bottom quartile / median / top quartile, with a marker for the company. Replaces the text-heavy parts of `PeerComparisonCard`.
- `ProgressRing`: percent with a label (data readiness, actions done).
- `StatusChip`: icon + word for supplied / partial / missing, available / coming soon, not started / in progress / done.
- `VerdictBadge`: big badge for the answer (e.g. "Fix first", "Hire now", "Retention is the leak").
- `Timeline`: Now / Next / Later columns for staged plans and the journey steps.
- `ExpandableDetail`: consistent "Why?" / "Show evidence" disclosure.
- `QuestionIllustration`: one simple, original line illustration (inline SVG) per growth question, in brand colours. No stock photos and no AI imagery clichés.

## Screen by screen

### 1. Library
- Card per question: illustration, the question as title, a one-line "for when", and three outcome chips with icons (e.g. Fix Churn: "Churn drivers", "At-risk accounts", "First priority"). Price shown as a small chip.
- "Recommended for you" as a ribbon, not a paragraph.
- Coming-soon cards muted with the coming-soon chip, no body copy beyond the one line.

### 2. Question page and questionnaire
- Hero: illustration + question + one line.
- A visual **4-step strip** (Snapshot → Data → Results → Action plan) with icons, replacing "How this works" prose.
- "What you'll get": a small blurred preview thumbnail of a real Results screen (from the sample company) with 3 labelled callouts, instead of the bullet list.
- "Data we may ask for": icon grid of data types (P&L, CRM export, customer list, call recordings…), each one word, details on hover or tap.
- Questionnaire: one question per step with a progress bar. Ranges as segmented choices or sliders, big tap targets. Keep every current question and its validation.

### 3. Growth Snapshot
- Top: 3–4 `MetricTile`s from the founder's answers (e.g. ARR growth, NRR, gross churn), coloured by peer quartile where a comparison exists.
- Peer comparison: one `QuartileBar` per metric, with the source as a small chip ("Source: … 2026" or "Assumption: Growth Goaled standard reference").
- "What your answers suggest": each signal becomes a compact card with an icon (positive / watch / info), a one-line title and a "based on" chip. Detail goes behind "Why?".
- "Is this the right question?": a single fit badge plus one line.
- "What it would take to confirm": data-type icon checklist.
- "How we work with companies like yours": collapsed by default.
- Primary CTA (buy / continue) stays prominent and above the fold on desktop.

### 4. Data
- Top: `ProgressRing` for "Ready for analysis" plus the big upload drop zone and **Run my report** button (keep `DataTopPanel` behaviour).
- Required items as a tile grid grouped by plan dimension. Each tile: icon, short name, `StatusChip`. "Why it matters" moves to a tooltip or expand.
- Recorded sales calls: a visual "2 of 3 calls" meter explaining the advisor-review rule in one line.
- Figure checker: a compact table with source chips; disagreements highlighted in amber.

### 5. Results (the most important screen)
- **Answer card** at the top: `VerdictBadge`, a one-sentence answer, 3 `MetricTile`s that justify it, a confidence meter, and one primary action ("Commit to this plan"). Advisor offer as a small secondary link.
- **One signature chart per question**, built from computed figures:
  - Fix Churn: ARR bridge waterfall (starting ARR → new → expansion → contraction → churn → ending ARR), plus churn by segment bars.
  - Growth Hiring Plan: capacity vs target bars per rep (or "no reps yet" state), pipeline coverage gauge, funnel conversion chart.
  - Repeatable Sales Motion: segment scatter or bubble chart (win rate × ACV, bubble = revenue), plus channel bars.
- **Plan dimensions** (capacity, pipeline, retention, ICP, channels, sales calls, hiring…): each section becomes chart or tiles first, then at most 3 one-line findings. "What the evidence shows", "Points against", assumptions and data behind it go into `ExpandableDetail` / Source Trail.
- **Staged plan** as a `Timeline` (Now / Next / Later) of action cards: title, owner, KPI chip. Details on expand.
- Data gaps: a compact strip of "Needs data" tiles linking to Data.
- Keep the advisor-review state ("with an advisor for review") as a clear visual state, not a paragraph.

### 6. Action plan
- Top: `ProgressRing` for actions done, plus the next reassessment date as a chip and the **Reassess now** button.
- Actions as a three-column board (Not started / In progress / Done; dropped hidden behind a toggle), with drag or a status menu. Cards show title, KPI chip and owner.
- "Metrics against your baseline": one `MetricTile` per tracked metric showing baseline → latest (and target where one exists) with a sparkline and an improving / worse status.
- "Figures that changed since the brief": compact list with up/down icons.

## Milestones (stop after each, with before/after screenshots)
- **V0 · Mockups first.** Build the shared components and static versions of Results and Snapshot for the sample company (Acme AI) behind a dev-only route or flag. Commit screenshots at 1440×900 and 390×844, with before/after word counts. Wait for owner approval of the visual direction before continuing.
- **V1 · Library + Question page + questionnaire.**
- **V2 · Snapshot + Data.**
- **V3 · Results**, with signature charts for all three live questions.
- **V4 · Action plan**, then a final consistency pass, the `/sample` pages (which reuse these components), e2e and accessibility checks.

## Done when
- Every in-scope screen meets the word budget and leads with a visual.
- No information was lost: everything removed from the page surface is reachable via a disclosure or the Source Trail.
- Charts render only from sourced figures and degrade to "Needs data" tiles.
- Works at 390px wide with no horizontal scroll; AA contrast; charts have text alternatives.
- Before/after screenshots for each screen committed to `docs/screenshots/visual-founder-flow/`, plus a table of word counts per screen.
- Existing tests pass; add component tests for the new visuals and update e2e selectors.
