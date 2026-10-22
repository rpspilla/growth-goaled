import type { ReactNode } from "react";
import { StagingBadge } from "@/components/shell/Shell";

/** Full-bleed navy frame from the prototype's Welcome screen. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-8 py-16 overflow-hidden" style={{ background: "var(--navy)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(21,90,60,0.18) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute top-6 left-6 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold" style={{ background: "var(--green)", color: "#fff" }}>
          G
        </div>
        <span className="font-semibold text-white text-sm tracking-tight">Growth Goaled</span>
        <StagingBadge />
      </div>
      <div className="relative w-full max-w-sm" style={{ animation: "fadeInUp 0.4s ease-out" }}>
        {children}
      </div>
    </div>
  );
}
