import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleDot, Info, MinusCircle, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

/*
 * Visual-first building blocks for the founder flow (docs/briefs/2026-10-29-visual-founder-flow.md).
 * Numbers are tiles or charts; status is colour + icon + word, never colour alone.
 */

export type Tone = "green" | "amber" | "red" | "blue" | "neutral";

export const TONE: Record<Tone, { fg: string; bg: string }> = {
  green: { fg: "var(--green)", bg: "var(--green-muted)" },
  amber: { fg: "#92400E", bg: "var(--amber-muted)" },
  red: { fg: "#B91C1C", bg: "var(--red-muted)" },
  blue: { fg: "var(--blue)", bg: "var(--blue-muted)" },
  neutral: { fg: "var(--muted-foreground)", bg: "var(--muted)" },
};

/** A metric as a tile: label, big number, one comparison line. */
export function MetricTile({
  label,
  value,
  compare,
  tone = "neutral",
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  compare?: string;
  tone?: Tone;
  trend?: "up" | "down";
  icon?: LucideIcon;
}) {
  const T = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;
  return (
    <div className="surface p-4 sm:p-5 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
        {Icon && <Icon size={14} aria-hidden />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`font-mono font-semibold tracking-tight ${value.length > 7 ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"}`} style={{ color: "var(--foreground)" }}>
        {value}
      </div>
      {compare && (
        <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: TONE[tone].fg }}>
          {T && <T size={14} aria-hidden />}
          {compare}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<string, { icon: LucideIcon; tone: Tone; word: string }> = {
  in: { icon: CheckCircle2, tone: "green", word: "Supplied" },
  partial: { icon: CircleDot, tone: "amber", word: "Partial" },
  missing: { icon: CircleDashed, tone: "neutral", word: "Needs data" },
  positive: { icon: CheckCircle2, tone: "green", word: "Strength" },
  watch: { icon: AlertTriangle, tone: "amber", word: "Watch" },
  info: { icon: Info, tone: "blue", word: "Note" },
  soon: { icon: MinusCircle, tone: "neutral", word: "Coming soon" },
};

/** Icon + short word + colour. */
export function StatusChip({ status, word }: { status: keyof typeof STATUS; word?: string }) {
  const s = STATUS[status]!;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: TONE[s.tone].bg, color: TONE[s.tone].fg }}>
      <Icon size={13} aria-hidden />
      {word ?? s.word}
    </span>
  );
}

export function signalIcon(tone: "positive" | "watch" | "info"): { icon: LucideIcon; tone: Tone } {
  return { positive: { icon: CheckCircle2, tone: "green" as Tone }, watch: { icon: AlertTriangle, tone: "amber" as Tone }, info: { icon: Info, tone: "blue" as Tone } }[tone];
}

/** The answer, as a big badge. */
export function VerdictBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm sm:text-base font-semibold px-3.5 py-1.5 rounded-lg" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>
      <span className="w-2 h-2 rounded-full" style={{ background: TONE[tone].fg }} aria-hidden />
      {label}
    </span>
  );
}

/** Percent ring (readiness, actions done, confidence). */
export function ProgressRing({ value, label, size = 88, tone = "green" }: { value: number; label: string; size?: number; tone?: Tone }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE[tone].fg}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="font-mono" style={{ fontSize: size * 0.22, fontWeight: 600, fill: "var(--foreground)" }}>
          {Math.round(v * 100)}%
        </text>
      </svg>
      <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{label}</span>
    </div>
  );
}

/** "Why?" / "Show evidence": detail stays one click away, off the page surface. */
export function ExpandableDetail({ summary = "Why?", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none font-semibold inline-flex items-center gap-1 list-none" style={{ color: "var(--green)" }}>
        <span className="transition-transform group-open:rotate-90" aria-hidden>›</span>
        {summary}
      </summary>
      <div className="mt-2 pl-3 border-l-2 space-y-1.5" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
        {children}
      </div>
    </details>
  );
}

/** Small source line under a chart, with the Source Trail affordance. */
export function SourceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--subtle-foreground)" }}>
      Source · {children}
    </span>
  );
}

/** Mockup-only banner. */
export function MockupBanner() {
  return (
    <div className="text-xs font-mono px-3 py-1.5 rounded-md inline-flex items-center gap-2" style={{ background: "var(--amber-muted)", color: "#92400E" }}>
      MOCKUP · Acme AI sample company · per-rep, funnel and pipeline figures are illustrative
    </div>
  );
}
