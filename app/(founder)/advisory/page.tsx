import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { AdvisoryRequestForm } from "@/components/use-cases/AdvisoryRequestForm";
import { founderContext } from "@/lib/data/founder-context";
import { advisoryBookingUrl, formatPrice, pricing } from "@/lib/pricing";
import { getUseCase } from "@/lib/use-cases";
import { requestAdvisory } from "./actions";

const card = { background: "var(--card)", borderColor: "var(--border)" };

/** Optional advisory support: book directly (when a booking link is configured) or ask us to arrange a session. */
export default async function AdvisoryPage({ searchParams }: { searchParams: Promise<{ use_case?: string; kind?: string }> }) {
  await founderContext();
  const params = await searchParams;
  const useCase = getUseCase(params.use_case ?? "");
  const kind = params.kind === "monthly" ? "monthly" : "review";
  const booking = advisoryBookingUrl(kind);
  const price = formatPrice(pricing().advisoryFromCents);

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      {useCase && <Link href="/baseline" className="text-xs" style={{ color: "var(--muted-foreground)" }}>← Back to your results</Link>}
      <PageHeader
        eyebrow="Optional"
        title={kind === "monthly" ? "Monthly executive advisor call" : "Review with an executive advisor"}
        subtitle={`${kind === "monthly" ? "A monthly working call with an executive-level Growth Goaled advisor to keep your plan on schedule" : "A working session with an executive-level Growth Goaled advisor"}${useCase ? ` on your ${useCase.shortTitle} results` : ""}. From ${price}.`}
      />
      <div className="rounded-xl border p-5 sm:p-6 mb-6" style={card}>
        <div className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>In the session we&apos;ll</div>
        <ul className="text-sm space-y-1 mb-4" style={{ color: "var(--muted-foreground)" }}>
          <li>• Review and challenge the assessment findings</li>
          <li>• Prioritize the recommendations</li>
          <li>• Talk through the trade-offs and strategic decisions</li>
          <li>• Turn it into an execution plan for the next 90 days</li>
        </ul>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Sessions start at {price}, depending on scope; we confirm the price before anything is booked. Your assessment stays fully available either way.
        </p>
      </div>
      <div className="rounded-xl border p-5 sm:p-6" style={card}>
        {booking ? (
          <>
            <a
              href={`/advisory/book?kind=${kind}${useCase ? `&use_case=${useCase.id}` : ""}`}
              className="inline-block px-4 py-2 rounded-lg text-sm font-semibold mb-4"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              Choose a time →
            </a>
            <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>Opens our booking page. Prefer we reach out? Send a note instead:</p>
          </>
        ) : null}
        <AdvisoryRequestForm useCase={useCase?.id ?? ""} request={requestAdvisory} />
      </div>
    </div>
  );
}
