import type { UseCaseId } from "@/lib/use-cases";

/*
 * One original line illustration per growth question, in brand colours. Decorative: the
 * question title next to it carries the meaning, so each SVG is aria-hidden.
 */

const G = "#155A3C";
const GL = "#1A7049";
const A = "#D97706";
const N = "#0D1B2A";
const S = { fill: "none", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Leak() {
  // Bars climb, then a crack in the last bar drips revenue away.
  return (
    <>
      <path d="M22 82h116" stroke={N} {...S} strokeWidth={2} opacity={0.35} />
      <rect x="32" y="56" width="16" height="26" rx="3" fill={G} opacity={0.35} />
      <rect x="56" y="44" width="16" height="38" rx="3" fill={G} opacity={0.55} />
      <rect x="80" y="32" width="16" height="50" rx="3" fill={G} opacity={0.8} />
      <rect x="104" y="40" width="16" height="42" rx="3" fill={G} />
      <path d="M112 46l-3 6 4 4-3 6" stroke="#fff" {...S} strokeWidth={2} />
      <path d="M128 60c0 0-5 6-5 9a5 5 0 0 0 10 0c0-3-5-9-5-9z" fill={A} />
      <path d="M136 74c0 0-3 4-3 6a3 3 0 0 0 6 0c0-2-3-6-3-6z" fill={A} opacity={0.6} />
      <path d="M34 50l24-12 24-12 24 8" stroke={GL} {...S} strokeDasharray="4 5" />
    </>
  );
}

function Hiring() {
  // A small team at capacity on a gauge; one new seat waiting.
  const person = (x: number, o: number, c = G) => (
    <g opacity={o}>
      <circle cx={x} cy={52} r={7} fill={c} />
      <path d={`M${x - 11} 80c0-9 5-15 11-15s11 6 11 15`} fill={c} />
    </g>
  );
  return (
    <>
      <path d="M52 38a28 28 0 0 1 56 0" stroke="#E2E8F0" {...S} strokeWidth={6} />
      <path d="M52 38a28 28 0 0 1 50.6-16.5" stroke={GL} {...S} strokeWidth={6} />
      <path d="M80 38l14-12" stroke={N} {...S} />
      <circle cx="80" cy="38" r="3" fill={N} />
      {person(46, 1)}
      {person(72, 0.8)}
      {person(98, 0.6)}
      <g>
        <circle cx={124} cy={52} r={7} fill="none" stroke={A} strokeWidth={2.5} strokeDasharray="3 3" />
        <path d="M113 80c0-9 5-15 11-15s11 6 11 15" fill="none" stroke={A} strokeWidth={2.5} strokeDasharray="3 3" />
      </g>
    </>
  );
}

function Icp() {
  // Concentric target with a tight cluster of customers near the centre and strays outside.
  return (
    <>
      <circle cx="80" cy="50" r="38" stroke="#E2E8F0" {...S} />
      <circle cx="80" cy="50" r="25" stroke={GL} {...S} opacity={0.5} />
      <circle cx="80" cy="50" r="12" stroke={G} {...S} />
      {[
        [76, 46],
        [85, 48],
        [79, 55],
        [88, 42],
        [72, 52],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3.5} fill={G} />
      ))}
      {[
        [36, 28],
        [128, 74],
        [124, 22],
        [38, 80],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3.5} fill={A} opacity={0.75} />
      ))}
      <path d="M118 12l-24 24" stroke={N} {...S} />
      <path d="M118 12l-1 8m1-8l-8 1" stroke={N} {...S} />
    </>
  );
}

function Raise({ b = false }: { b?: boolean }) {
  // Steps up to a flag.
  return (
    <>
      <path d="M24 84h28V68h28V52h28V36h28" stroke={G} {...S} />
      <path d="M136 36V12" stroke={N} {...S} />
      <path d="M136 12h-20l6 6-6 6h20" fill={b ? GL : A} stroke="none" />
      <circle cx="38" cy="76" r="3" fill={GL} opacity={0.5} />
      <circle cx="66" cy="60" r="3" fill={GL} opacity={0.7} />
      <circle cx="94" cy="44" r="3" fill={GL} />
    </>
  );
}

function Update() {
  // A one-page update with a rising line.
  return (
    <>
      <rect x="44" y="10" width="72" height="80" rx="6" stroke={N} {...S} opacity={0.6} />
      <path d="M56 26h32M56 34h22" stroke={N} {...S} strokeWidth={2} opacity={0.35} />
      <path d="M56 74l14-12 12 6 22-20" stroke={G} {...S} />
      <circle cx="104" cy="48" r="3.5" fill={G} />
      <path d="M56 82h48" stroke="#E2E8F0" {...S} strokeWidth={2} />
      <circle cx="122" cy="20" r="9" fill={A} opacity={0.9} />
      <path d="M118 20l3 3 5-6" stroke="#fff" {...S} strokeWidth={2} />
    </>
  );
}

const ART: Record<UseCaseId, () => React.ReactElement> = {
  growth_leak: Leak,
  hire_or_fix: Hiring,
  winning_icp: Icp,
  series_a_ready: () => <Raise />,
  series_b_ready: () => <Raise b />,
  founder_handoff: Update,
};

export function QuestionIllustration({ id, muted = false, className = "" }: { id: UseCaseId; muted?: boolean; className?: string }) {
  const Art = ART[id];
  return (
    <div
      className={`rounded-xl flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: muted ? "#EEF1F4" : "var(--green-muted)", filter: muted ? "grayscale(1)" : undefined, opacity: muted ? 0.7 : 1 }}
      aria-hidden
    >
      <svg viewBox="0 0 160 96" className="w-full h-full max-h-full">
        <Art />
      </svg>
    </div>
  );
}
