"use client";

// Client component: NavLink takes a render function, which cannot cross the server/client boundary.
import { NavLink } from "./NavLink";
import type { StepState } from "@/lib/use-cases/steps";

export type SwitcherOption = { id: string; label: string };
export type ExtraLink = { href: string; label: string };

/**
 * Founder sidebar: which question you're working on, the steps to answer it (with what's next and
 * what's locked), then company pages that are always available. `basePath` re-roots the steps so the
 * advisor's company view can show the same journey under /advisor/companies/[id].
 */
export function UseCaseSidebar({
  steps,
  basePath = "",
  options,
  activeUseCase,
  select,
  libraryHint,
  extra = [],
}: {
  steps: StepState[];
  basePath?: string;
  options: SwitcherOption[];
  activeUseCase: string | null;
  select: (formData: FormData) => Promise<void>;
  libraryHint?: string;
  extra?: ExtraLink[];
}) {
  const hrefFor = (path: string) => (basePath ? (path === "/overview" ? basePath : `${basePath}${path}`) : path);

  return (
    <>
      <div className="px-4 pt-4 pb-4 border-b" style={{ borderColor: "#1E3347" }}>
        <div className="text-xs font-medium mb-1.5" style={{ color: "#8FA3B8" }}>Working on</div>
        {options.length > 1 ? (
          <form action={select}>
            <select
              name="useCase"
              aria-label="Active question"
              defaultValue={activeUseCase ?? ""}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full text-sm rounded-lg px-2.5 py-2"
              style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid #2A4157" }}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id} style={{ color: "#000" }}>
                  {o.label}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <div className="text-sm font-semibold" style={{ color: options[0] ? "#fff" : "#A9B8C8" }}>
            {options[0]?.label ?? libraryHint ?? "Nothing yet"}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Steps">
        <div className="px-3 pb-2 text-xs font-medium" style={{ color: "#8FA3B8" }}>Your plan</div>
        <div className="space-y-0.5">
          {steps.map((step, i) => {
            const href = hrefFor(step.path);
            // Say why a step is locked once; the same reason repeated under each step is noise.
            const sameReasonAbove = i > 0 && steps[i - 1]!.locked && steps[i - 1]!.lockedReason === step.lockedReason;
            const badge = (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                style={{
                  background: step.done ? "#2F9E6E" : step.current ? "rgba(61,220,151,0.18)" : "rgba(255,255,255,0.08)",
                  color: step.done ? "#fff" : step.current ? "#3DDC97" : "#8FA3B8",
                }}
                aria-hidden
              >
                {step.done ? (
                  <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  step.number
                )}
              </span>
            );
            if (step.locked) {
              return (
                <div key={step.key} className="px-3 py-2.5 rounded-lg text-sm" style={{ color: "#6E859C", cursor: "default" }} aria-disabled="true">
                  <div className="flex items-center gap-3">
                    {badge}
                    <span className="font-medium">{step.label}</span>
                    <svg className="ml-auto" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-label="Locked">
                      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  {!sameReasonAbove && <div className="text-xs mt-1 pl-8" style={{ color: "#8197AD" }}>{step.lockedReason}</div>}
                </div>
              );
            }
            return (
              <NavLink key={step.key} href={href} exact={href === basePath}>
                {(active) => (
                  <>
                    {badge}
                    <span className="font-medium" style={{ color: active ? "#fff" : undefined }}>{step.label}</span>
                    {step.current && (
                      <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(61,220,151,0.16)", color: "#3DDC97" }}>
                        Next
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
        {extra.length > 0 && (
          <>
            <div className="px-3 pt-6 pb-2 text-xs font-medium" style={{ color: "#8FA3B8" }}>Company</div>
            <div className="space-y-0.5">
              {extra.map((l) => (
                <NavLink key={l.href} href={l.href}>
                  {(active) => <span className="font-medium pl-8" style={{ color: active ? "#fff" : undefined }}>{l.label}</span>}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>
    </>
  );
}
