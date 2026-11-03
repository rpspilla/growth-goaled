import { Check } from "lucide-react";
import { Pill, type Tone } from "@/components/ui/Pill";
import { CONFIDENCE_MEASURE, CONFIDENCE_RULES, EVIDENCE_KINDS } from "@/lib/chat/legend";
import { SUPPORTED_SUMMARY } from "@/lib/plan-offer";

/** Where the founder is, from the first conversation to a plan they're running. */
export type LegendStage = "recommendation" | "collecting" | "review" | "delivered" | "supported";

const CONFIDENCE: { key: keyof typeof CONFIDENCE_RULES; label: string; tone: Tone }[] = [
  { key: "high", label: "High", tone: "green" },
  { key: "medium", label: "Medium", tone: "amber" },
  { key: "low", label: "Low", tone: "red" },
];
const KINDS: { key: keyof typeof EVIDENCE_KINDS; label: string; tone: Tone }[] = [
  { key: "fact", label: "Fact", tone: "green" },
  { key: "figure", label: "Your figure", tone: "blue" },
  { key: "assumption", label: "Assumption", tone: "amber" },
  { key: "hypothesis", label: "Hypothesis", tone: "neutral" },
];
const SECTIONS: [string, string][] = [
  ["Do this", "The one move we'd make now, and its priority."],
  ["What's happening", "Our diagnosis of the situation behind your question."],
  ["Based on", "Each input, labelled so you can see what's known and what's assumed."],
  ["Next steps and how you'll know", "What to do first, and the measures that show it's working."],
  ["30/60/90-day plan", "An outline from the conversation so far: a starting point, not yet your action plan."],
  ["Would make this more certain", "What to share to raise confidence."],
];

/**
 * How to read a recommendation (confidence, evidence labels, each section) and where the founder is
 * on the way from a conversation to an action plan.
 */
export function RecommendationLegend({ stage, planPrice, supportedPrice }: { stage: LegendStage; planPrice: string; supportedPrice: string }) {
  const at = stage === "recommendation" ? 1 : stage === "collecting" || stage === "review" ? 2 : 3;
  const steps = [
    { title: "Talk it through", body: "Free. Ask anything; we ask only what we need." },
    { title: "Your recommendation", body: "A first view: what we'd do and why, with how sure we are." },
    {
      title: "Your action plan",
      body:
        stage === "collecting"
          ? "In progress: we're gathering what the plan needs in the conversation. Submit it when you're ready."
          : stage === "review"
            ? "Submitted: a CRO advisor is reviewing it, usually within 24 hours."
            : `${planPrice} once: a full 30/60/90-day plan built from this conversation and your data, reviewed and approved by a CRO advisor. Or ${supportedPrice} a month for ${SUPPORTED_SUMMARY}.`,
    },
    { title: "Put it to work", body: stage === "supported" ? "Chat with your advisor here any time, use your 2 live hours each month, and tick off milestones as you go." : "Run the milestones, track the measures, and evaluate the suggested tools." },
  ];
  return (
    <aside aria-label="How to read your recommendation" className="surface p-5 space-y-5 text-sm" style={{ color: "var(--foreground)" }}>
      <section aria-label="Where you are">
        <h3 className="label mb-2">Where you are</h3>
        <ol className="space-y-2.5">
          {steps.map((s, i) => {
            const done = i < at;
            const current = i === at;
            return (
              <li key={s.title} className="flex gap-2.5" aria-current={current ? "step" : undefined}>
                <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: done || current ? "var(--green)" : "var(--muted)", color: done || current ? "#fff" : "var(--muted-foreground)" }}>
                  {done ? <Check size={12} aria-hidden /> : i + 1}
                </span>
                <span>
                  <span className="font-semibold">{s.title}</span>
                  {current && <span className="ml-1.5 text-xs font-semibold" style={{ color: "var(--green)" }}>You are here</span>}
                  <span className="block" style={{ color: "var(--muted-foreground)" }}>{s.body}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Confidence">
        <h3 className="label mb-1">Confidence</h3>
        <p className="mb-2" style={{ color: "var(--muted-foreground)" }}>{CONFIDENCE_MEASURE}</p>
        <ul className="space-y-1.5">
          {CONFIDENCE.map((c) => (
            <li key={c.key} className="flex gap-2 items-start">
              <span className="shrink-0 w-[4.5rem]"><Pill tone={c.tone}>{c.label}</Pill></span>
              <span style={{ color: "var(--muted-foreground)" }}>{CONFIDENCE_RULES[c.key]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Evidence labels">
        <h3 className="label mb-2">Evidence labels</h3>
        <ul className="space-y-1.5">
          {KINDS.map((k) => (
            <li key={k.key} className="flex gap-2 items-start">
              <span className="shrink-0 w-[6.75rem]"><Pill tone={k.tone}>{k.label}</Pill></span>
              <span style={{ color: "var(--muted-foreground)" }}>{EVIDENCE_KINDS[k.key]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="What each part means">
        <h3 className="label mb-2">What each part means</h3>
        <dl className="space-y-1.5">
          {SECTIONS.map(([term, def]) => (
            <div key={term}>
              <dt className="font-semibold">{term}</dt>
              <dd style={{ color: "var(--muted-foreground)" }}>{def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
