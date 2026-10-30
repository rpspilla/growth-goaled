import { FileWarning, Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { KeyFileCard } from "@/components/readiness/KeyFileCard";
import { SignatureCharts } from "@/components/views/SignatureCharts";
import { MetricTile, VerdictBadge } from "@/components/visual/primitives";
import type { ReadinessFile } from "@/lib/data/readiness";
import type { Teaser } from "@/lib/data/teaser";
import { formatMetric } from "@/lib/metrics";
import type { UseCaseDef } from "@/lib/use-cases";

/**
 * The free teaser on the Snapshot page: upload the key file, see the verdict headline and what's at
 * stake from your own numbers, with the chart blurred behind "unlock". The rest is the $149 answer.
 */
export function TeaserVerdict({
  teaser,
  useCase,
  files,
  blobPrefix,
  unlock,
  price,
}: {
  teaser: Teaser;
  useCase: Pick<UseCaseDef, "id" | "keyFile">;
  files: ReadinessFile[];
  blobPrefix: string;
  /** The purchase button (or a note when payments aren't set up). */
  unlock: ReactNode;
  price: string;
}) {
  if (!useCase.keyFile) return null;
  if (teaser.state === "no_file") {
    return (
      <div className="space-y-2" data-testid="teaser">
        <div className="label" style={{ color: "var(--green)" }}>
          Free · see your answer from your own numbers
        </div>
        <KeyFileCard keyFile={useCase.keyFile} files={files} inAlready={false} blobPrefix={blobPrefix} />
      </div>
    );
  }
  if (teaser.state === "reading") {
    return (
      <section className="surface p-5 flex items-center gap-4" data-testid="teaser" aria-live="polite">
        <BuildingRefresh active />
        <Loader2 size={24} className="animate-spin shrink-0" style={{ color: "var(--green)" }} aria-hidden />
        <div>
          <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
            Reading {teaser.filename}
          </div>
          <p data-label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Usually under a minute · this page updates on its own
          </p>
        </div>
      </section>
    );
  }
  if (teaser.state === "unreadable") {
    return (
      <div className="space-y-2" data-testid="teaser">
        <div className="rounded-lg px-4 py-3 text-sm flex gap-2 items-start" role="note" style={{ background: "var(--amber-muted)", color: "#78350F" }}>
          <FileWarning size={18} className="shrink-0" aria-hidden />
          <span>
            We couldn&apos;t read {teaser.filename}
            {teaser.error ? `: ${teaser.error}` : "."} Try a CSV or Excel export with one row per customer (or deal) and month.
          </span>
        </div>
        <KeyFileCard keyFile={useCase.keyFile} files={files} inAlready={false} blobPrefix={blobPrefix} />
      </div>
    );
  }
  return (
    <section className="surface p-5 sm:p-6 space-y-4" style={{ borderColor: "var(--green)", borderWidth: 2 }} aria-labelledby="teaser-title" data-testid="teaser">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="label" style={{ color: "var(--green)" }}>
          Your early answer · from {teaser.filename}
        </span>
      </div>
      {teaser.headline ? (
        <div className="space-y-2">
          <VerdictBadge label={teaser.certainty === "established" ? "Clear signal" : "Most likely"} tone={teaser.certainty === "established" ? "green" : "amber"} />
          <h2 id="teaser-title" className="font-display text-2xl sm:text-3xl leading-tight" style={{ color: "var(--foreground)" }}>
            {teaser.headline}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {teaser.impactArr !== null && teaser.impactArr > 0 && (
              <span data-label className="font-mono text-sm font-semibold px-2 py-0.5 rounded" style={{ background: "var(--amber-muted)", color: "#92400E" }}>
                {formatMetric("arr", teaser.impactArr)} ARR at stake
              </span>
            )}
            {teaser.evidenceCount > 0 && (
              <span data-label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Based on {teaser.evidenceCount} {teaser.evidenceCount === 1 ? "finding" : "findings"} calculated from your file
              </span>
            )}
          </div>
        </div>
      ) : (
        <h2 id="teaser-title" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Here&apos;s what your file shows. The full answer works out what to fix first.
        </h2>
      )}
      {teaser.figures.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {teaser.figures.map((f) => (
            <MetricTile key={f.metric} label={f.label} value={f.value} compare={f.period && f.period !== "Current" ? f.period : "From your file"} />
          ))}
        </div>
      )}
      <div className="relative rounded-xl overflow-hidden">
        <div aria-hidden style={{ filter: "blur(7px)", pointerEvents: "none", userSelect: "none" }} inert>
          <SignatureCharts useCase={useCase.id} charts={teaser.charts} baseline={[]} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4" style={{ background: "rgba(247,248,250,0.55)" }}>
          <div className="surface p-5 max-w-sm w-full text-center space-y-3 shadow-lg">
            <Lock size={22} className="mx-auto" style={{ color: "var(--green)" }} aria-hidden />
            <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
              Unlock the full answer
            </div>
            <p data-label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              The charts, the evidence behind it, and your first action · {price}
            </p>
            {unlock}
          </div>
        </div>
      </div>
    </section>
  );
}
