/**
 * Rally's suggested questions on a new conversation (Rally Beta, Nov 24, 2026): four short ones for
 * the company's stage and what's under way. Each opens a conversation on a topic, in these words.
 */
export type Suggestion = { topic: string; text: string };

const EARLY = new Set(["pre-seed", "preseed", "seed", "idea", "pre-revenue"]);

export function suggestionsFor(input: { stage: string | null; openCommitments: number }): Suggestion[] {
  const early = !input.stage || EARLY.has(input.stage.trim().toLowerCase());
  const list: Suggestion[] = [];
  if (input.openCommitments > 0) list.push({ topic: "other", text: "Review what I committed to and what's stuck" });
  list.push({ topic: "other", text: "Where is our biggest growth constraint?" });
  if (early) {
    list.push({ topic: "first_gtm_hire", text: "Are we ready to hire our first salesperson?" });
    list.push({ topic: "pipeline_conversion", text: "Why isn't our pipeline converting?" });
    list.push({ topic: "revenue_engine", text: "How do we build a repeatable revenue engine?" });
  } else {
    list.push({ topic: "more_salespeople", text: "Should we hire more salespeople?" });
    list.push({ topic: "pipeline_conversion", text: "Why isn't our pipeline converting?" });
    list.push({ topic: "retention_efficiency", text: "How can we improve retention and revenue efficiency?" });
  }
  list.push({ topic: "other", text: "What should we prioritize over the next 90 days?" });
  return list.slice(0, 4);
}
