# /prototype — design reference only (not deployed)

Source: Figma Make file **"Growth-Goaled-Product-Video"**
URL: https://www.figma.com/make/zkGSHSZaiLOJWIZbq0zXIY/Growth-Goaled-Product-Video
File key: `zkGSHSZaiLOJWIZbq0zXIY`

## What's committed here
- `src/index.css` — design tokens, fonts, animations
- `src/components/Layout.tsx` — founder + advisor sidebars and top bar
- `src/data/mock.ts` — Acme AI and portfolio numbers (seed source for M2)

## Still to pull (Claude Code, at the start of M1)
The 19 view files live in the Figma Make file. Pull them into this folder before porting screens:

`src/App.tsx`, `src/imports/pasted_text/growth-goaled-product-brief.md`,
`src/views/{Welcome,Intake,Upload,Processing,Dashboard,Benchmark,Baseline,ICP,ChannelStrategy,HiringPlan,Questions,Deliverables,CompoundingIntelligence}.tsx`,
`src/views/advisor/{Portfolio,CompanyView,ReviewQueue,Methodology}.tsx`

How: with the Figma connector, call `get_design_context` on file key `zkGSHSZaiLOJWIZbq0zXIY`, nodeId `0:1`. It returns a resource link per source file; read each and save it here at the same path, unchanged.
If the Figma connector isn't available, ask the owner to download the code from Figma Make and unzip it into this folder.

Do not import from `/prototype` in the app. Port markup and styling into `app/` and `components/`.
