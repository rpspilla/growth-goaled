/**
 * How much weight a result can bear, from facts about how it was produced (never a model's opinion):
 * how many figures it rests on, whether any are unconfirmed, and how many inputs are still missing.
 */
export type Confidence = { level: "High" | "Medium" | "Low"; reasons: string[] };

export function resultConfidence(input: { reviewed: boolean; unconfirmed: number; gaps: number; metrics: number }): Confidence {
  const reasons: string[] = [
    input.reviewed ? "Every figure was checked in code against your inputs, and an advisor reviewed it." : "Every figure was checked in code against your inputs.",
  ];
  if (input.unconfirmed) reasons.push(`${input.unconfirmed} ${input.unconfirmed === 1 ? "figure was" : "figures were"} read from your files and not yet confirmed by you.`);
  if (input.gaps) reasons.push(`${input.gaps} data ${input.gaps === 1 ? "gap limits" : "gaps limit"} how far the conclusions go (listed below).`);
  if (input.metrics < 3) reasons.push(`Based on ${input.metrics} ${input.metrics === 1 ? "figure" : "figures"}; more data would broaden it.`);
  const issues = (input.unconfirmed ? 1 : 0) + (input.gaps ? 1 : 0) + (input.metrics < 3 ? 1 : 0);
  return { level: issues === 0 ? "High" : issues === 1 ? "Medium" : "Low", reasons };
}
