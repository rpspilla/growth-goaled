/**
 * Common questions founders ask before trusting the analysis. Shown on sign-up and the growth
 * questions page. Keep answers plain and short; the marketing site carries the same wording.
 */
export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "How is this different from prompting Claude or ChatGPT?",
    a: "A chatbot can give you two different answers to the same question about the same data. Growth Goaled runs a fixed method against an industry data model: your figures are calculated in code from your own files, compared with similar companies, and give the same answer every time on the same data. Every figure links back to where it came from, and a Growth Goaled advisor can pressure-test the findings with you.",
  },
];

export function Faq({ className }: { className?: string }) {
  return (
    <section aria-labelledby="faq" className={className}>
      <h2 id="faq" className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>
        Common questions
      </h2>
      <div className="space-y-2">
        {FAQ.map((f) => (
          <details key={f.q} className="disclosure text-sm" style={{ color: "var(--muted-foreground)" }}>
            <summary className="font-semibold cursor-pointer" style={{ color: "var(--foreground)" }}>
              {f.q}
            </summary>
            <p className="mt-1.5">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
