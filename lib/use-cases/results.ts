/**
 * How much weight a result can bear, from facts about how it was produced (never a model's opinion):
 * whether it was reviewed, whether any figures are unconfirmed, and how many inputs are still missing.
 */
export type Confidence = { level: "High" | "Medium" | "Low"; reasons: string[] };

export function resultConfidence(input: { reviewed: boolean; unconfirmed: number; gaps: number; metrics: number }): Confidence {
  const reasons: string[] = [];
  reasons.push(input.reviewed ? "Reviewed and approved by an analyst." : "Built automatically and checked in code; not yet reviewed by an analyst.");
  if (input.unconfirmed) reasons.push(`${input.unconfirmed} ${input.unconfirmed === 1 ? "figure was" : "figures were"} read from your files and not yet confirmed by you.`);
  if (input.gaps) reasons.push(`${input.gaps} ${input.gaps === 1 ? "input is" : "inputs are"} still missing (listed under next steps).`);
  if (input.metrics < 3) reasons.push(`Based on ${input.metrics} ${input.metrics === 1 ? "metric" : "metrics"}; more data would broaden it.`);
  const issues = (input.unconfirmed ? 1 : 0) + (input.gaps ? 1 : 0) + (input.metrics < 3 ? 1 : 0);
  const level = input.reviewed ? (issues === 0 ? "High" : "Medium") : issues === 0 ? "Medium" : "Low";
  return { level, reasons };
}
