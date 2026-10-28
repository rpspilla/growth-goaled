import type { ReactNode } from "react";

export type Tone = "green" | "amber" | "red" | "blue" | "neutral";

const TONES: Record<Tone, { background: string; color: string }> = {
  green: { background: "var(--green-muted)", color: "var(--green)" },
  amber: { background: "var(--amber-muted)", color: "#92400E" },
  red: { background: "var(--red-muted)", color: "#B91C1C" },
  blue: { background: "var(--blue-muted)", color: "var(--blue)" },
  neutral: { background: "var(--muted)", color: "var(--muted-foreground)" },
};

/** A short status or category label. Colour carries meaning (good, attention, problem, info), never decoration. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={TONES[tone]}>
      {children}
    </span>
  );
}
