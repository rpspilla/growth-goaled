import { CalendarClock } from "lucide-react";
import { FounderAvatar } from "@/components/brand/HumanPresence";

/** After six exchanges without a plan: a gentle pointer to a call with Growth Goaled, or the plans. */
export function AdvisorNudge({ bookHref, plansHref }: { bookHref: string; plansHref: string | null }) {
  return (
    <aside aria-label="Talk to Growth Goaled" className="rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: "var(--green-muted)" }}>
      <FounderAvatar size={32} />
      <p className="text-sm flex-1 min-w-[14rem]" style={{ color: "var(--foreground)" }}>
        You&apos;ve covered a lot of ground. Want to talk it through with someone at Growth Goaled? It&apos;s a free call, and we&apos;ll tell you honestly what would help most.
      </p>
      <div className="flex gap-2 flex-wrap">
        <a href={bookHref} className="btn btn-primary text-sm inline-flex items-center gap-1.5">
          <CalendarClock size={16} aria-hidden /> Book a free call
        </a>
        {plansHref && (
          <a href={plansHref} className="btn btn-secondary text-sm">
            See the plans
          </a>
        )}
      </div>
    </aside>
  );
}
