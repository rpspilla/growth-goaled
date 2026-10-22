import { NavLink } from "./NavLink";
import { FOUNDER_NAV, PROGRESS_PHASES, currentStep, progressIndex } from "@/lib/phases";
import type { Company } from "@/lib/db/schema";

export function FounderSidebar({ phase }: { phase: Company["phase"] }) {
  const activeStep = currentStep(phase);
  const progress = progressIndex(phase);
  const complete = progress >= PROGRESS_PHASES.length;

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {FOUNDER_NAV.map((item) => {
          const completed = item.step < activeStep;
          const isCurrent = item.step === activeStep;
          return (
            <NavLink key={item.href} href={item.href} match={"match" in item ? item.match : item.href}>
              {(active) => (
                <>
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-xs"
                    style={{
                      background: completed
                        ? "var(--green)"
                        : active || isCurrent
                          ? "rgba(21,90,60,0.5)"
                          : "rgba(255,255,255,0.08)",
                      color: completed ? "#fff" : "#7A98B4",
                    }}
                  >
                    {completed ? (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span style={{ fontSize: "8px" }}>{item.step}</span>
                    )}
                  </span>
                  <span className="font-medium" style={{ color: active ? "#fff" : undefined }}>
                    {item.label}
                  </span>
                  {isCurrent && (
                    <span
                      className="ml-auto text-xs px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(21,90,60,0.4)", color: "#6EE7A8", fontSize: "10px" }}
                    >
                      Active
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-4 pb-5 pt-3 border-t" style={{ borderColor: "#1E3347" }}>
        <div className="text-xs mb-2" style={{ color: "#5A7A96" }}>Progress</div>
        <div className="flex items-center gap-1.5 mb-1.5">
          {PROGRESS_PHASES.map((p, i) => (
            <div
              key={p}
              className="flex-1 h-1 rounded-full"
              style={{
                background: i < progress ? "var(--green)" : i === progress ? "rgba(21,90,60,0.5)" : "rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </div>
        <div className="text-xs" style={{ color: "#5A7A96" }}>
          {complete
            ? "All phases complete"
            : `Phase ${progress + 1} of ${PROGRESS_PHASES.length} · ${PROGRESS_PHASES[progress]}`}
        </div>
      </div>
    </>
  );
}
