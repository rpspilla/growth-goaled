import { Check } from "lucide-react";
import type { HowWeWork } from "@/lib/use-cases/how-we-work";

/** "How we work with companies like yours", collapsed: shown after the first answer, not before it. */
export function HowWeWorkDetails({ approach }: { approach: HowWeWork }) {
  return (
    <section className="surface p-4" aria-labelledby="how-we-work">
      <details className="group">
        <summary className="cursor-pointer list-none flex items-center gap-2">
          <span className="transition-transform group-open:rotate-90" style={{ color: "var(--green)" }} aria-hidden>
            ›
          </span>
          <h2 id="how-we-work" className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            How we work with companies like yours
          </h2>
        </summary>
        <div className="mt-3 space-y-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
          <p>{approach.audience}</p>
          <ul className="space-y-1.5" style={{ color: "var(--foreground)" }}>
            {approach.approach.map((a) => (
              <li key={a} className="flex gap-2">
                <Check size={16} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />
                <span>{a}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl p-3" style={{ background: "var(--muted)" }}>
            <p className="font-medium" style={{ color: "var(--foreground)" }}>
              {approach.example.trigger}
            </p>
            <ol className="space-y-1 list-decimal pl-5 mt-1.5" style={{ color: "var(--foreground)" }}>
              {approach.example.steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
        </div>
      </details>
    </section>
  );
}
