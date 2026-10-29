# Visual founder flow: before / after

Brief: `docs/briefs/2026-10-29-visual-founder-flow.md`. Screenshots at 1440×900 (desktop) and 390×844 (mobile), full page, taken against the same local test data: the e2e founder ("E2E Analytics") with the Tidewater Forecasting workbook's calculated figures, and two fresh founders for the Library, questionnaire and Snapshot. "Before" is commit `12a80ea` (pre-V1); "after" is this branch. Results are test-mode briefs (stubbed model), so findings are thinner than a real report.

## Word counts

Counted in the browser at 1440×900. **Copy** is body text in paragraphs and list items (not headings, buttons, chips, chart or tile labels, numbers, or anything collapsed); this is what the brief's budget limits. **All words** counts every visible word except chart/tile labels and numbers.

| Screen | Budget | Copy above fold (before → after) | All words above fold | All words on page |
|---|---|---|---|---|
| Library | ≤ 40 | 137 → **36** | 202 → 105 | 272 → 105 |
| Question page + questionnaire | ≤ 40 | 147 → **19** | 184 → 60 | 293 → 98 |
| Growth Snapshot | ≤ 60 | 153 → **28** | 202 → 83 | 679 → 122 |
| Data | — | 137 → **95** | 191 → 142 | 1,101 → 631 |
| Results · Fix Churn | ≤ 60 | 99 → **14** | 157 → 61 | 1,411 → 614 |
| Results · Repeatable Sales Motion | ≤ 60 | 123 → **13** | 180 → 59 | 1,314 → 503 |
| Results · Growth Hiring Plan | ≤ 60 | 115 → **12** | 172 → 70 | 1,177 → 538 |
| Action plan | ≤ 60 | 102 → **24** | 133 → 71 | 282 → 90 |

Data's remaining copy above the fold is mostly the figure checker's rows, which are a working table rather than prose.

Nothing was removed: long copy moved behind "Details", "Why?", "Show evidence", "Source" and similar disclosures, or into the Source Trail.

## Files

`<screen>-before-desktop.png`, `<screen>-after-desktop.png`, and the same with `-mobile`. No screen scrolls horizontally at 390px.
