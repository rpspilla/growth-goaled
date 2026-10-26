import type { UseCaseId } from "./types";

/**
 * "How we work with companies like yours" on the free Snapshot: how the assessment
 * approaches this question for a company shaped like the founder's (stage, industry,
 * segment, sales model, size), and a concrete example of what we'd do together after
 * it. Written as what we would do, never as past results or a promised outcome.
 */

type Value = string | number | null | undefined;

export type HowWeWork = {
  /** "Seed fintech companies selling to mid-market companies, with founder-led sales, at $1–3M ARR" */
  audience: string;
  /** How we approach this question for companies like this. */
  approach: string[];
  /** A concrete example of the work after the assessment, tailored to the founder's answers. */
  example: { trigger: string; steps: string[] };
};

export type HowWeWorkInput = {
  useCase: UseCaseId;
  /** Intake answers keyed "section.field". */
  profile: Readonly<Record<string, Value>>;
  revenueBand: string | null;
};

const INDUSTRY: Record<string, string> = {
  "AI / Automation": "AI automation companies",
  Fintech: "fintech companies",
  HealthTech: "health tech companies",
  "B2B SaaS": "B2B SaaS companies",
};
const SEGMENT: Record<string, string> = { SMB: "small businesses", "Mid-market": "mid-market companies", Enterprise: "enterprise buyers", Mixed: "a mix of segments" };
const BAND: Record<string, string> = { lt_1m: "under $1M ARR", "1m_3m": "$1–3M ARR", "3m_10m": "$3–10M ARR", "10m_20m": "$10–20M ARR", "20m_50m": "$20–50M ARR" };

const str = (v: Value) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: Value) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function howWeWork(input: HowWeWorkInput): HowWeWork {
  const p = input.profile;
  const stage = str(p["company.stage"]);
  const industry = str(p["company.industry"]);
  const segment = str(p["customers.segment"]);
  const model = str(p["gtm.model"]);
  const nrr = num(p["customers.nrr"]);
  const reps = num(p["gtm.sales_reps"]);
  const founderLed = model === "Founder-led";

  let audience = `${stage ? `${stage} ` : "Early-stage "}${INDUSTRY[industry ?? ""] ?? "B2B software companies"}`;
  if (segment && SEGMENT[segment]) audience += ` selling to ${SEGMENT[segment]}`;
  if (model) audience += `, with ${model.toLowerCase()} sales`;
  if (input.revenueBand && BAND[input.revenueBand]) audience += `, at ${BAND[input.revenueBand]}`;

  switch (input.useCase) {
    case "growth_leak":
      return {
        audience,
        approach: [
          "Measure your growth and retention from your own revenue and customer data, to see whether new business, expansion or churn is behind the slowdown.",
          "Compare your key metrics with approved peer reference data where it exists, and say plainly where it doesn't.",
          "Name the one constraint that explains most of the slowdown, show the evidence, and say how sure we are.",
        ],
        example:
          nrr !== null && nrr < 100
            ? {
                trigger: "If the assessment confirms that existing customers are where growth is leaking, we'd:",
                steps: [
                  "List the accounts behind the downgrades and churn, and what they have in common (segment, onboarding, product usage).",
                  "Set up a renewal-risk review 90 days before each renewal, with a named owner per account.",
                  "Add an onboarding milestone every new customer must reach in their first month.",
                  "Track net retention monthly against the target you set, so you can see within a quarter whether it's working.",
                ],
              }
            : {
                trigger: "If the assessment shows the leak is in new business rather than retention, we'd:",
                steps: [
                  "Pinpoint the stage where deals stall and compare the deals you won with the ones you lost at that stage.",
                  "Rewrite the qualification and follow-up for that stage, with one change you can test over the next month.",
                  "Set stage conversion as the KPI to watch, with a target and a date to review it.",
                  "Hold off on buying more leads until the fix is measured.",
                ],
              },
      };
    case "series_a_ready":
    case "series_b_ready": {
      const round = input.useCase === "series_a_ready" ? "Series A" : "Series B";
      return {
        audience,
        approach: [
          `Score your readiness area by area against the ${round} bars we have cited sources for, and say plainly where there's no reference.`,
          "Work out runway from your cash and burn and line it up with your raise timeline.",
          "List the questions investors are most likely to press on, with the evidence you'll need for each.",
        ],
        example: founderLed
          ? {
              trigger: `If the assessment shows that founder-led sales is the weak spot in your ${round} story, we'd:`,
              steps: [
                "Pick a set of upcoming deals for someone other than you to run end to end.",
                "Write down your discovery and pricing steps so they can be repeated without you.",
                "Turn the gaps into a 90-day plan, ordered by what investors will ask about first.",
                "Set the date to start the raise based on runway, not on the calendar.",
              ],
            }
          : {
              trigger: `If the assessment shows gaps in your ${round} metrics, we'd:`,
              steps: [
                "Rank the gaps by how much each one would weaken your story in diligence.",
                "Pick the two or three you can visibly move in 90 days and set a target for each.",
                "Prepare the evidence for the questions investors will ask: retention by cohort, revenue concentration, burn efficiency.",
                "Line the plan up against runway so the raise starts with room to spare.",
              ],
            },
      };
    }
    case "hire_or_fix":
      return {
        audience,
        approach: [
          "Measure what each rep produces today, how full their pipeline is and how long new hires took to ramp.",
          "Check whether pipeline, conversion or process would limit new hires before they could pay for themselves.",
          "Give a clear call: hire now, fix first, or run a small test, with the reasoning behind it.",
        ],
        example:
          reps !== null && reps > 0
            ? {
                trigger: "If the assessment shows your current reps aren't yet at capacity, we'd:",
                steps: [
                  "Fix the constraint first, such as lead routing or qualification, and give it a short, measured window.",
                  "Set a pipeline-coverage threshold that triggers the next hire, so hiring follows a number the board can see.",
                  "Write the profile and ramp plan for that hire now, so you can move as soon as the threshold is met.",
                ],
              }
            : {
                trigger: "If the assessment shows you're ready for a first sales hire, we'd:",
                steps: [
                  "Decide whether the first hire should be an AE or a player-coach, based on your deal size and cycle.",
                  "Write a 90-day ramp plan with the deals and accounts they'll start on.",
                  "Set the milestones that show the hire is working before you add a second.",
                ],
              },
      };
    case "winning_icp":
      return {
        audience,
        approach: [
          "Group your customers into segments and compare win rate, deal size, cycle, retention and expansion for each.",
          "Rank the segments by how attractive they are commercially, and flag where samples are too small to be sure.",
          "Turn the result into an ICP definition your team can qualify against.",
        ],
        example: {
          trigger: "If the assessment shows one segment clearly outperforms the rest, we'd:",
          steps: [
            "Rewrite qualification questions so reps spot that segment early and deprioritize the weakest one.",
            "Point outbound and messaging at the winning segment for one quarter.",
            "Design two small experiments to test the secondary segment before you commit to it.",
            "Track win rate and cycle for the target segment monthly to confirm the shift is working.",
          ],
        },
      };
    case "founder_handoff":
      return {
        audience,
        approach: [
          "Compare your deals with your team's: win rate, cycle, discounting, and which stages only happen when you're there.",
          "Check how much of the process is written down and repeatable.",
          "Recommend the next role (first AE or sales leader) and when, based on what's missing.",
        ],
        example: {
          trigger: "If the assessment shows deals depend on you at specific stages, we'd:",
          steps: [
            "Write those stages (often discovery and pricing) as steps someone else can run.",
            "Have you shadow instead of lead on a set of deals, and compare the results with your own.",
            "Set checkpoints for stepping back further, so you hand over in stages rather than all at once.",
            "Define the profile for the next sales hire based on the gaps that remain.",
          ],
        },
      };
  }
}
