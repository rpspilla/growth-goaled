/**
 * How to read a recommendation: shared by the legend founders see and the AI's instructions, so the
 * explanation and the rule the AI follows can't drift apart.
 */
export const CONFIDENCE_RULES = {
  high: "Built mostly on facts you've stated and your own figures; the key inputs are known.",
  medium: "A mix: some key inputs are confirmed, others are assumptions or estimates.",
  low: "Rests mainly on assumptions or hypotheses, or key information is still missing.",
} as const;

export const CONFIDENCE_MEASURE =
  "Confidence reflects how much of the recommendation rests on what you've told us and your own figures, versus assumptions. It's set by that rule, not by how good the news is.";

export const EVIDENCE_KINDS = {
  fact: "Something you stated as fact in the conversation or your profile.",
  figure: "A number from your own data: entered by you or read from your files.",
  assumption: "Taken as given to move forward, not yet confirmed. Correct it if it's wrong.",
  hypothesis: "Our read of what's likely going on, to test rather than rely on.",
} as const;
