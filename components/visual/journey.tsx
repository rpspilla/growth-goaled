import { BarChart3, ClipboardCheck, Database, Sparkles, type LucideIcon } from "lucide-react";
import { getItem } from "@/lib/readiness";
import type { UseCaseDef, UseCaseId } from "@/lib/use-cases";
import { visualFor } from "@/lib/use-cases/visual";
import { dataItemIcon, dataItemShort } from "./icons";

/* Question-page visuals: the 4-step strip, the Results preview and the data icon grid. */

const STEPS: { label: string; icon: LucideIcon; note: (price: string | null) => string }[] = [
  { label: "Snapshot", icon: Sparkles, note: () => "Free" },
  { label: "Data", icon: Database, note: (p) => p ?? "Assessment" },
  { label: "Results", icon: BarChart3, note: () => "Minutes" },
  { label: "Action plan", icon: ClipboardCheck, note: () => "Track it" },
];

/** Snapshot → Data → Results → Action plan, replacing the "How this works" prose. */
export function StepStrip({ price, current = 0 }: { price: string | null; current?: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1 sm:gap-2" aria-label="How this works">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const on = i === current;
        return (
          <li key={s.label} className="relative flex flex-col items-center text-center gap-1.5" aria-current={on ? "step" : undefined}>
            {i > 0 && <span className="absolute top-5 right-1/2 w-full h-0.5 -z-0" style={{ background: "var(--border)" }} aria-hidden />}
            <span
              className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: on ? "var(--green)" : "var(--card)", color: on ? "#fff" : "var(--green)", border: on ? "none" : "2px solid var(--border)" }}
            >
              <Icon size={18} aria-hidden />
            </span>
            <span className="text-xs sm:text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              {s.label}
            </span>
            <span className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>
              {s.note(price)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The signature chart for each question, drawn small for the Results preview. */
function MiniChart({ id }: { id: UseCaseId }) {
  const G = "#155A3C";
  const A = "#D97706";
  if (id === "growth_leak") {
    // ARR bridge: start, +new, +expansion, −contraction, −churn, end.
    const bars = [
      { y: 30, h: 40, c: "#94A3B8" },
      { y: 18, h: 12, c: G },
      { y: 12, h: 6, c: G },
      { y: 12, h: 6, c: A },
      { y: 18, h: 14, c: A },
      { y: 32, h: 38, c: "#94A3B8" },
    ];
    return (
      <>
        {bars.map((b, i) => (
          <rect key={i} x={10 + i * 22} y={b.y} width="16" height={b.h} rx="2" fill={b.c} />
        ))}
      </>
    );
  }
  if (id === "hire_or_fix") {
    const hs = [52, 46, 40, 34, 28];
    return (
      <>
        <path d="M6 22h132" stroke="#0D1B2A" strokeDasharray="3 3" strokeWidth="1.2" />
        {hs.map((h, i) => (
          <rect key={i} x={12 + i * 26} y={70 - h} width="18" height={h} rx="2" fill={h >= 46 ? G : A} />
        ))}
      </>
    );
  }
  if (id === "winning_icp") {
    const pts = [
      [30, 50, 6, A],
      [55, 30, 12, G],
      [80, 40, 8, G],
      [105, 58, 5, A],
      [120, 22, 10, G],
    ] as const;
    return (
      <>
        <path d="M8 70h130M8 70V8" stroke="#CBD5E1" strokeWidth="1.2" />
        {pts.map(([x, y, r, c]) => (
          <circle key={`${x}`} cx={x} cy={y} r={r} fill={c} opacity={0.8} />
        ))}
      </>
    );
  }
  return (
    <>
      {[40, 28, 50, 34].map((w, i) => (
        <g key={i}>
          <rect x="10" y={12 + i * 15} width="124" height="8" rx="4" fill="#E2E8F0" />
          <rect x="10" y={12 + i * 15} width={w * 2} height="8" rx="4" fill={i === 2 ? G : i === 1 ? A : "#1A7049"} />
        </g>
      ))}
    </>
  );
}

/** A blurred thumbnail of the Results screen with three labelled callouts. */
export function ResultsPreview({ id }: { id: UseCaseId }) {
  const v = visualFor(id).preview;
  const callouts = [
    { n: 1, label: v.verdict, x: "8%", y: "9%" },
    { n: 2, label: v.chart, x: "8%", y: "44%" },
    { n: 3, label: v.plan, x: "8%", y: "80%" },
  ];
  return (
    <figure className="relative rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--background)" }} aria-label={`Preview of your results: ${v.verdict}, ${v.chart}, ${v.plan}`}>
      <svg viewBox="0 0 300 220" className="w-full block" style={{ filter: "blur(0.6px)" }} aria-hidden>
        {/* answer card */}
        <rect x="10" y="10" width="280" height="54" rx="8" fill="#fff" stroke="#E2E8F0" />
        <rect x="22" y="20" width="54" height="12" rx="4" fill="#FEF3C7" />
        <rect x="22" y="38" width="170" height="8" rx="3" fill="#0D1B2A" opacity="0.75" />
        <rect x="22" y="50" width="110" height="6" rx="3" fill="#CBD5E1" />
        <circle cx="262" cy="37" r="15" fill="none" stroke="#E2E8F0" strokeWidth="5" />
        <path d="M262 22a15 15 0 0 1 12 24" fill="none" stroke="#155A3C" strokeWidth="5" strokeLinecap="round" />
        {/* chart card */}
        <rect x="10" y="72" width="280" height="90" rx="8" fill="#fff" stroke="#E2E8F0" />
        <g transform="translate(78 84)">
          <MiniChart id={id} />
        </g>
        {/* plan columns */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={10 + i * 95} y="170" width="88" height="42" rx="8" fill="#F1F5F9" />
            <rect x={18 + i * 95} y="180" width="72" height="10" rx="3" fill="#fff" />
            <rect x={18 + i * 95} y="194" width={i === 2 ? 0 : 60} height="10" rx="3" fill="#fff" />
          </g>
        ))}
      </svg>
      {callouts.map((c) => (
        <figcaption
          key={c.n}
          className="absolute inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full shadow-sm"
          style={{ left: c.x, top: c.y, background: "var(--navy)", color: "#fff" }}
        >
          <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px]" style={{ background: "#3DDC97", color: "var(--navy)" }}>
            {c.n}
          </span>
          {c.label}
        </figcaption>
      ))}
    </figure>
  );
}

/** "Data we may ask for": one icon and one or two words per item; the full name and why on hover/tap. */
export function DataTypeGrid({ useCase }: { useCase: UseCaseDef }) {
  const keys = [...useCase.requiredItems, ...useCase.helpfulItems].slice(0, 8);
  return (
    <ul className="grid grid-cols-4 gap-2">
      {keys.map((k) => {
        const item = getItem(k);
        const Icon = dataItemIcon(k, item?.category);
        const required = useCase.requiredItems.includes(k);
        const name = item?.name ?? k;
        return (
          <li
            key={k}
            title={`${name}${useCase.itemWhy[k] ? `: ${useCase.itemWhy[k]}` : ""}`}
            className="rounded-xl p-2 flex flex-col items-center text-center gap-1.5 min-h-[4.75rem] justify-center"
            style={{ background: required ? "var(--green-muted)" : "var(--muted)" }}
          >
            <Icon size={20} style={{ color: required ? "var(--green)" : "var(--muted-foreground)" }} aria-hidden />
            <span className="text-[11px] font-semibold leading-tight" style={{ color: "var(--foreground)" }}>
              {dataItemShort(k, name)}
              {required && <span className="sr-only"> (needed)</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
