/** The assessment workflow, shown on every use case page. */
export function HowItWorks({ price, sellable }: { price: string; sellable: boolean }) {
  const steps = [
    ["Answer a few questions", "Free. About five minutes."],
    ["Get your Growth Snapshot", "Free. Early hypotheses from your answers, and which assessment fits."],
    ["Buy the assessment", sellable ? `${price}, one time. No subscription.` : "Launching soon."],
    ["Share your data", "Upload whatever you have; we sort it and show what's missing."],
    ["Receive your results", "Findings, evidence, recommendations and an action plan, with confidence and gaps stated plainly."],
  ];
  return (
    <ol className="space-y-3">
      {steps.map(([title, line], i) => (
        <li key={title} className="flex gap-3">
          <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--muted)", color: "var(--foreground)" }}>{i + 1}</span>
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{title}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{line}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
