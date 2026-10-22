import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: ReactNode; subtitle: string; children: ReactNode }) {
  return (
    <>
      <h1 className="font-display text-4xl font-normal mb-3 leading-tight text-center" style={{ color: "#FFFFFF" }}>
        {title}
      </h1>
      <p className="text-sm mb-8 text-center" style={{ color: "#7A98B4" }}>{subtitle}</p>
      <div className="rounded-xl p-6" style={{ background: "var(--card)" }}>
        {children}
      </div>
      <p className="text-xs text-center mt-8" style={{ color: "#5A7A96" }}>
        Know where you stand. Know what to fix. Know what comes next.
      </p>
    </>
  );
}
