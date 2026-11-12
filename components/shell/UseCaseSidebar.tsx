"use client";

// Client component: NavLink takes a render function, which cannot cross the server/client boundary.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink } from "./NavLink";
import type { StepState } from "@/lib/use-cases/steps";

export type SwitcherOption = { id: string; label: string };
/**
 * One menu item. `match` is the path that marks it current (an item that opens a section of a page,
 * `…#people`, never shows as current); `steps` are shown indented under it (Data, Results and Action
 * plan under Growth Projects while a growth project is active).
 */
export type NavItem = { href: string; label: string; match?: string; exact?: boolean; steps?: StepState[] };

/**
 * The founder sidebar (and the advisor's mirror of it): a heading that opens and closes the menu,
 * the menu items, and under Growth Projects the steps of the active growth project (with what's
 * next and what's locked). With more than one active project, a switcher picks which one.
 */
export function UseCaseSidebar({
  items,
  options,
  activeUseCase,
  select,
  label = "Company profile",
  collapsible = true,
}: {
  items: NavItem[];
  options: SwitcherOption[];
  activeUseCase: string | null;
  select: (formData: FormData) => Promise<void>;
  /** Heading over the menu. */
  label?: string;
  /** The heading opens and closes the menu (open to start). */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu">
      {/* Section labels look like labels (small caps, muted), not like smaller nav items. */}
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="sidebar-company"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold hover:bg-white/5"
          style={{ color: "#fff" }}
        >
          {label}
          <ChevronDown size={16} aria-hidden className="transition-transform" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", color: "#8FA3B8" }} />
        </button>
      ) : (
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8FA3B8" }}>{label}</div>
      )}
      <div id="sidebar-company" className={`space-y-0.5 ${collapsible ? "pl-2" : ""}`} hidden={collapsible && !open}>
        {items.map((item) => (
          <div key={item.href}>
            <NavLink href={item.href} match={item.match} exact={item.exact}>
              {(active) => <span className="font-medium" style={{ color: active ? "#fff" : undefined }}>{item.label}</span>}
            </NavLink>
            {item.steps && item.steps.length > 0 && <Steps steps={item.steps} options={options} activeUseCase={activeUseCase} select={select} />}
          </div>
        ))}
      </div>
    </nav>
  );
}

/** The active growth project's steps, indented under Growth Projects. */
function Steps({ steps, options, activeUseCase, select }: { steps: StepState[]; options: SwitcherOption[]; activeUseCase: string | null; select: (formData: FormData) => Promise<void> }) {
  return (
    <div className="pl-3 pt-1 pb-2 space-y-0.5" aria-label="Growth project steps" role="group">
      {options.length > 1 && (
        <form action={select} className="px-3 pb-1">
          <select
            name="useCase"
            aria-label="Active growth project"
            defaultValue={activeUseCase ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="w-full text-xs rounded-lg px-2 py-1.5"
            style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid #2A4157" }}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id} style={{ color: "#000" }}>
                {o.label}
              </option>
            ))}
          </select>
        </form>
      )}
      {steps.map((step, i) => {
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
            <div key={step.key} className="px-3 py-2 rounded-lg text-sm" style={{ color: "#6E859C", cursor: "default" }} aria-disabled="true">
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
          <NavLink key={step.key} href={step.path}>
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
  );
}
