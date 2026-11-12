import { describe, expect, it } from "vitest";
import { answerLine, askFor, checkAnswer, normalizeRequest } from "@/lib/plan-requests";

describe("plan data requests", () => {
  const req = normalizeRequest({
    fields: [
      { label: "Average deal cycle, founder-closed", kind: "days" },
      { label: "Average deal cycle, AE-closed", kind: "days" },
      { label: "Win rate", kind: "percent" },
      { label: "Win rate", kind: "percent" },
      { label: "  ", kind: "text" },
      { label: "ACV", kind: "made-up" },
    ],
    columns: ["Deal name", "Owner", "Deal name", " Close date "],
  });

  it("keeps fields with unique keys and known kinds, and unique columns", () => {
    expect(req.fields.map((f) => f.key)).toEqual(["average_deal_cycle_founder_closed", "average_deal_cycle_ae_closed", "win_rate", "win_rate_2", "acv"]);
    expect(req.fields.at(-1)!.kind).toBe("text");
    expect(req.columns).toEqual(["Deal name", "Owner", "Close date"]);
  });

  it("says what to enter", () => {
    expect(askFor({ fields: req.fields.slice(0, 1) })).toBe("Enter Average deal cycle, founder-closed");
    expect(askFor({ fields: req.fields.slice(0, 3) })).toBe("Enter Average deal cycle, founder-closed, Average deal cycle, AE-closed and Win rate");
  });

  it("checks typed values: every field, numbers as numbers", () => {
    const r = { fields: req.fields.slice(0, 3) };
    expect(checkAnswer(r, { average_deal_cycle_founder_closed: "30" })).toEqual({ ok: false, error: "Enter Average deal cycle, AE-closed." });
    expect(checkAnswer(r, { average_deal_cycle_founder_closed: "30", average_deal_cycle_ae_closed: "about 45", win_rate: "20" })).toEqual({ ok: false, error: "Average deal cycle, AE-closed should be a number." });
    const ok = checkAnswer(r, { average_deal_cycle_founder_closed: "30 days", average_deal_cycle_ae_closed: "45", win_rate: "22%" });
    expect(ok).toEqual({ ok: true, values: { average_deal_cycle_founder_closed: "30", average_deal_cycle_ae_closed: "45", win_rate: "22" } });
    expect(answerLine({ ...r, columns: [], answer: { values: (ok as { values: Record<string, string> }).values, at: "", by: "" } })).toBe("Average deal cycle, founder-closed: 30 days · Average deal cycle, AE-closed: 45 days · Win rate: 22%");
    expect(answerLine({ fields: [], columns: [], answer: { values: {}, filename: "deals.csv", at: "", by: "" } })).toBe("File: deals.csv");
  });
});
