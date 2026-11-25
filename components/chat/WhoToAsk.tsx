"use client";

import Link from "next/link";
import { Face, Faces, cap, type CroCard } from "./CroIdentity";

/**
 * Who to ask (Nov 25, 2026: the CRO collective is the product): the Rally Collective first, then each
 * published CRO with their face, title and top expertise. Picking one sets who answers; each is an AI
 * built on that CRO's documented expertise, which the line under the cards says.
 */
export function WhoToAsk({ cros, collective, value, onChange }: { cros: CroCard[]; collective: CroCard[]; value: string; onChange: (id: string) => void }) {
  const chosen = cros.find((c) => c.id === value) ?? null;
  const first = chosen?.name.split(" ")[0];
  const card = (selected: boolean) => ({
    className: "text-left rounded-2xl p-4 flex items-start gap-3 transition-colors hover:bg-[var(--muted)] focus-visible:outline-2",
    style: { border: `${selected ? 2 : 1}px solid ${selected ? "var(--green)" : "var(--border)"}`, background: selected ? "var(--green-muted)" : "var(--card)", margin: selected ? 0 : 1 },
  });
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Who do you want to ask?</h2>
        <Link href="/cros" className="link text-sm">See CRO profiles</Link>
      </div>
      <div role="radiogroup" aria-label="Who to ask" className="grid sm:grid-cols-2 gap-3">
        <button type="button" role="radio" aria-checked={!chosen} onClick={() => onChange("")} {...card(!chosen)}>
          <Faces cros={collective} size={36} />
          <span className="min-w-0">
            <span className="block font-semibold" style={{ color: "var(--foreground)" }}>Rally Collective Brain</span>
            <span className="block text-sm" style={{ color: "var(--muted-foreground)" }}>{collective.length > 1 ? `All our CROs (${collective.length}): different perspectives, one recommendation` : "All our CROs' combined expertise in one recommendation"}</span>
          </span>
        </button>
        {cros.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === value} onClick={() => onChange(c.id)} {...card(c.id === value)}>
            <Face name={c.name} photoUrl={c.photoUrl} size={44} />
            <span className="min-w-0">
              <span className="block font-semibold" style={{ color: "var(--foreground)" }}>{c.name}&apos;s CRO-Brain</span>
              {c.title && <span className="block text-sm truncate" style={{ color: "var(--muted-foreground)" }}>{c.title}</span>}
              {c.expertise.length > 0 && <span className="block text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{c.expertise.slice(0, 3).map(cap).join(" · ")}</span>}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {chosen ? `An AI built on ${first}'s documented expertise and judgment, not ${first} in person.` : "AI built on the documented expertise of the CROs in the Rally Collective."}
      </p>
    </div>
  );
}
