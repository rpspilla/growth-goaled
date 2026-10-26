"use client";

// Client component: NavLink takes a render function, which cannot cross the server/client boundary.
import { NavLink } from "./NavLink";
import type { StepState } from "@/lib/use-cases/steps";

export type SwitcherOption = { id: string; label: string };

/**
 * The five-step founder sidebar (HANDOFF §13.2). `basePath` re-roots links so the
 * advisor's company view can show the same steps under /advisor/companies/[id].
 */
export function UseCaseSidebar({
  steps,
  basePath = "",
  options,
  activeUseCase,
  select,
  libraryHint,
}: {
  steps: StepState[];
  basePath?: string;
  options: SwitcherOption[];
  activeUseCase: string | null;
  select: (formData: FormData) => Promise<void>;
  libraryHint?: string;
}) {
  const hrefFor = (path: string) => (basePath ? (path === "/overview" ? basePath : `${basePath}${path}`) : path);

  return (
    <>
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "#1E3347" }}>
        <div className="text-xs mb-1.5" style={{ color: "#5A7A96" }}>Use case</div>
        {options.length > 1 ? (
          <form action={select}>
            <select
              name="useCase"
              aria-label="Active use case"
              defaultValue={activeUseCase ?? ""}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full text-sm rounded-md px-2 py-1.5"
              style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid #1E3347" }}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id} style={{ color: "#000" }}>
                  {o.label}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <div className="text-sm font-medium" style={{ color: options[0] ? "#fff" : "#7A98B4" }}>
            {options[0]?.label ?? libraryHint ?? "None active yet"}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Steps">
        {steps.map((step) => {
          const href = hrefFor(step.path);
          const badge = (
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-xs"
              style={{
                background: step.done ? "var(--green)" : step.current ? "rgba(21,90,60,0.5)" : "rgba(255,255,255,0.08)",
                color: step.done ? "#fff" : "#7A98B4",
              }}
            >
              {step.done ? (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                  <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span style={{ fontSize: "8px" }}>{step.number}</span>
              )}
            </span>
          );
          if (step.locked) {
            return (
              <div key={step.key} className="px-3 py-2 rounded-md text-sm" style={{ color: "#3E5A74", cursor: "default" }} aria-disabled="true">
                <div className="flex items-center gap-2.5">
                  {badge}
                  <span className="font-medium">{step.label}</span>
                  <svg className="ml-auto" width="10" height="10" viewBox="0 0 16 16" fill="none" aria-label="Locked">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
                <div className="text-xs mt-0.5 pl-6" style={{ color: "#4E6A84" }}>{step.lockedReason}</div>
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
                    <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(21,90,60,0.4)", color: "#6EE7A8", fontSize: "10px" }}>
                      Next
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
