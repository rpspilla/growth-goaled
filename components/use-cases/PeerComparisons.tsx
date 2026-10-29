import type { PeerComparison } from "@/lib/benchmark-library/peers";
import { ExpandableDetail } from "@/components/visual/primitives";
import { PeerComparisonCard } from "./PeerComparisonCard";

/**
 * Growth, retention and revenue against peers in the founder's industry and founding years, or,
 * where no data fits, Growth Goaled's standard reference (labelled an assumption). Shared by the
 * free Snapshot and the paid assessment, so both compare on the same basis.
 */
export function PeerComparisons({ peers, level = 2, columns = 1 }: { peers: PeerComparison[]; level?: 2 | 3; columns?: 1 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section id="peers-section" aria-labelledby="peers" className="scroll-mt-24">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <Heading id="peers" className={level === 2 ? "scroll-mt-24 text-xl font-semibold" : "text-lg font-semibold"} style={{ color: "var(--foreground)" }}>
          How you compare with peers
        </Heading>
        <span data-label className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }} aria-hidden>
          ● you · ▬ bottom–top quartile · | median
        </span>
      </div>
      <div className={columns === 3 ? "grid md:grid-cols-3 gap-3" : "space-y-3"}>
        {peers.map((c) => (
          <PeerComparisonCard key={c.key} c={c} />
        ))}
      </div>
      <div className="mt-2">
        <ExpandableDetail summary="How peers are chosen">
          <p>
            Growth, retention and revenue against companies in your industry founded around the same time, from the same sources for every company. Where no data fits yet, we say so and show Growth Goaled&apos;s standard reference instead, labelled as an assumption. The band shows the bottom to top quartile; the line is the median.
          </p>
        </ExpandableDetail>
      </div>
    </section>
  );
}
