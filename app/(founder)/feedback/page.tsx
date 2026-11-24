import { ActionForm } from "@/components/advisor/ActionForm";
import { founderContext } from "@/lib/data/founder-context";
import { BETA_QUESTIONS } from "@/lib/data/chat";
import { betaFeedbackAction } from "./actions";

export const metadata = { title: "Share feedback · Rally" };

/** Rally Beta: five short, optional questions about Rally itself. Answer any of them. */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await founderContext();
  const { from } = await searchParams;
  const source = from === "helpful" ? "after_helpful" : "rail";
  const text = (k: keyof typeof BETA_QUESTIONS, rows = 2) => (
    <label key={k} className="block">
      <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{BETA_QUESTIONS[k]}</span>
      <textarea name={k} rows={rows} maxLength={2000} className="field w-full mt-1.5" aria-label={BETA_QUESTIONS[k]} />
    </label>
  );
  return (
    <div className="page max-w-2xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl" style={{ color: "var(--foreground)" }}>Help shape Rally</h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Rally is in Beta and free while we build it with founders like you. Answer any of these, as briefly as you like; the Growth Goaled team reads every one.
        </p>
      </header>
      <ActionForm action={betaFeedbackAction} submit="Send feedback" label="Rally feedback" resetOnSuccess className="surface p-5 space-y-5">
        <input type="hidden" name="source" value={source} />
        {source === "after_helpful" ? [text("indispensable", 3), text("missing"), text("most_valuable")] : [text("most_valuable"), text("missing"), text("wish"), text("indispensable", 3)]}
        <fieldset className="space-y-1.5">
          <legend className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{BETA_QUESTIONS.use_regularly}</legend>
          <div className="flex gap-4 text-base">
            {[["yes", "Yes"], ["maybe", "Maybe"], ["no", "Not yet"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2"><input type="radio" name="use_regularly" value={v} /> {l}</label>
            ))}
          </div>
        </fieldset>
      </ActionForm>
    </div>
  );
}
