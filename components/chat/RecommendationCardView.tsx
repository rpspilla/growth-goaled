import Link from "next/link";
import type { RecommendationCard } from "@/lib/db/schema";
import { Pill, type Tone } from "@/components/ui/Pill";
import { FeedbackButtons } from "./FeedbackButtons";

const fg = { color: "var(--foreground)" };
const muted = { color: "var(--muted-foreground)" };
const CONFIDENCE: Record<RecommendationCard["confidence"]["level"], { label: string; tone: Tone }> = {
  high: { label: "High confidence", tone: "green" },
  medium: { label: "Medium confidence", tone: "amber" },
  low: { label: "Low confidence", tone: "red" },
};
const KIND: Record<RecommendationCard["evidence"][number]["kind"], { label: string; tone: Tone }> = {
  fact: { label: "Fact", tone: "green" },
  figure: { label: "Your figure", tone: "blue" },
  assumption: { label: "Assumption", tone: "amber" },
  hypothesis: { label: "Hypothesis", tone: "neutral" },
};

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="label mb-1">{title}</h4>
      <ul className="space-y-1 text-base list-disc pl-5" style={fg}>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** The decision card: the takeaway first, then why, then what to do and how to tell it's working. */
export function RecommendationCardView({
  id,
  card,
  given,
  deeper,
  feedback,
  compact = false,
  informedBy = [],
}: {
  id: string;
  card: RecommendationCard;
  given: string[];
  deeper: { href: string; label: string } | null;
  /** Omitted for visitors (nothing to rate yet). */
  feedback?: (recommendationId: string, kind: string, note: string | null) => Promise<{ ok: boolean; error?: string }>;
  /** Just the headline and how sure we are; the rest folds away behind "Show the full recommendation". */
  compact?: boolean;
  /** The CRO intelligence it drew on, attributed (multi-CRO intelligence, Nov 23, 2026). */
  informedBy?: { title: string; cro: string; how: string }[];
}) {
  const c = CONFIDENCE[card.confidence.level];
  const full = (
    <>
      <div className="rounded-xl px-4 py-3" style={{ background: "var(--muted)" }}>
        <div className="text-sm font-bold" style={{ color: "var(--green)" }}>Do this</div>
        <p className="text-base font-medium mt-0.5" style={fg}>{card.recommendation}</p>
        {card.priority && <p className="text-sm mt-1" style={muted}>Priority: {card.priority}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <h4 className="label mb-1">What&apos;s happening</h4>
          <p className="text-base" style={fg}>{card.diagnosis}</p>
        </div>
        {card.evidence.length > 0 && (
          <div>
            <h4 className="label mb-1">Based on</h4>
            <ul className="space-y-1.5">
              {card.evidence.map((e, i) => (
                <li key={i} className="flex gap-2 items-start text-base" style={fg}>
                  <Pill tone={KIND[e.kind].tone}>{KIND[e.kind].label}</Pill>
                  <span className="min-w-0">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <List title="Next steps" items={card.nextSteps} />
        <List title="How you'll know it's working" items={card.successMeasures} />
      </div>

      {(card.plan.days30.length > 0 || card.plan.days60.length > 0 || card.plan.days90.length > 0) && (
        <div>
          <h4 className="label mb-2">30/60/90-day plan</h4>
          <div className="grid sm:grid-cols-3 gap-3">
            {(
              [
                ["Days 1–30", card.plan.days30],
                ["Days 31–60", card.plan.days60],
                ["Days 61–90", card.plan.days90],
              ] as const
            ).map(([label, items]) => (
              <div key={label} className="rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
                <div className="text-sm font-semibold mb-1" style={fg}>{label}</div>
                <ul className="space-y-1 text-sm list-disc pl-4" style={fg}>
                  {items.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {((card.tradeoffs?.length ?? 0) > 0 || (card.alternatives?.length ?? 0) > 0) && (
        <div className="grid sm:grid-cols-2 gap-5">
          <List title="The tradeoffs" items={card.tradeoffs ?? []} />
          {card.alternatives && card.alternatives.length > 0 && (
            <div>
              <h4 className="label mb-1">Considered instead</h4>
              <ul className="space-y-1 text-base" style={fg}>
                {card.alternatives.map((a, i) => (
                  <li key={i}>
                    <span className="font-semibold">{a.option}</span> <span style={muted}>· {a.whyNot}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {card.perspectives && card.perspectives.length > 0 && (
        <div aria-label="Where our CROs differ">
          <h4 className="label mb-1">Where our CROs see it differently</h4>
          <ul className="space-y-2">
            {card.perspectives.map((p, i) => (
              <li key={i} className="rounded-xl p-3 text-base" style={{ border: `1px solid ${p.fits ? "var(--green)" : "var(--border)"}` }}>
                <div style={fg}>
                  <span className="font-semibold">{p.held_by}:</span> {p.view}
                </div>
                <div className="text-sm mt-0.5" style={muted}>
                  Assumes: {p.assumptions}
                  {p.fits ? " · the view that fits your company" : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {informedBy.length > 0 && (
        <div aria-label="Informed by">
          <h4 className="label mb-1">Informed by</h4>
          <ul className="space-y-1 text-sm" style={muted}>
            {informedBy.map((s, i) => (
              <li key={i}>
                <span className="font-semibold" style={fg}>{s.cro}</span> · {s.title}
                {s.how ? ` (${s.how})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.missing.length > 0 && (
        <p className="text-base" style={muted}>
          <span className="font-semibold" style={fg}>Would make this more certain: </span>
          {card.missing.join("; ")}.
        </p>
      )}

      {(feedback || deeper) && (
      <div className="flex items-center gap-4 flex-wrap pt-1 border-t" style={{ borderColor: "var(--border)" }}>
        {feedback && <FeedbackButtons recommendationId={id} given={given} send={feedback} />}
        {deeper && (
          <Link href={deeper.href} className="link text-sm ml-auto">
            {deeper.label}
          </Link>
        )}
      </div>
      )}
    </>
  );
  return (
    <article aria-label="Recommendation" className="surface p-5 sm:p-6 space-y-5" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }}>
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="label" style={{ color: "var(--green)" }}>Recommendation</span>
          <Pill tone={c.tone}>{c.label}</Pill>
        </div>
        <p className="font-display text-2xl sm:text-3xl leading-tight" style={fg}>{card.takeaway}</p>
        <p className="text-base mt-2" style={muted}>{card.confidence.why}</p>
      </div>
      {compact ? (
        <details className="group">
          <summary className="text-sm link cursor-pointer list-none">
            <span className="group-open:hidden">Show the full recommendation</span>
            <span className="hidden group-open:inline">Hide the details</span>
          </summary>
          <div className="space-y-5 mt-5">{full}</div>
        </details>
      ) : (
        full
      )}
    </article>
  );
}
