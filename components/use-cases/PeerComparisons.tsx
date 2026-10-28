import type { PeerComparison } from "@/lib/benchmark-library/peers";
import { PeerComparisonCard } from "./PeerComparisonCard";

/**
 * Growth, retention and revenue against peers in the founder's industry and founding years, or,
 * where no data fits, Growth Goaled's standard reference (labelled an assumption). Shared by the
 * free Snapshot and the paid assessment, so both compare on the same basis.
 */
export function PeerComparisons({ peers, level = 2 }: { peers: PeerComparison[]; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby="peers">
      <Heading id="peers" className={level === 2 ? "text-xl sm:text-2xl font-semibold" : "text-lg font-semibold"} style={{ color: "var(--foreground)" }}>
        How you compare with peers
      </Heading>
      <p className="text-base mt-1 mb-4" style={{ color: "var(--muted-foreground)" }}>
        Growth, retention and revenue against companies in your industry founded around the same time, from the same sources for every company. Where no data fits yet, we say so and show Growth Goaled&apos;s standard reference instead, labelled as an assumption. The band shows the bottom to top quartile; the line is the median.
      </p>
      <div className="space-y-4">
        {peers.map((c) => <PeerComparisonCard key={c.key} c={c} />)}
      </div>
    </section>
  );
}
