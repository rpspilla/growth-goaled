"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatMinutes } from "@/lib/plan-tracking";

type Log = (kind: string, minutes: number, heldOn: string, note: string) => Promise<{ ok: boolean; error?: string }>;
export type SessionRow = { id: string; kind: "review" | "support"; minutes: number; heldOn: string; note: string };
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The advisor logs monthly reviews and live support; the founder sees the time used against two hours a month. */
export function SessionLog({ sessions, usedMinutes, allowanceMinutes, today, log }: { sessions: SessionRow[]; usedMinutes: number; allowanceMinutes: number; today: string; log: Log }) {
  const [kind, setKind] = useState<"review" | "support">("review");
  const [minutes, setMinutes] = useState("30");
  const [heldOn, setHeldOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section aria-label="Live time with the founder" className="space-y-3">
      <div>
        <h3 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Reviews and live support</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Live support this month: {formatMinutes(usedMinutes)} of {formatMinutes(allowanceMinutes)}. Monthly progress reviews are logged separately and don&apos;t count against the two hours.
        </p>
      </div>
      <form
        aria-label="Log a session"
        className="grid sm:grid-cols-[auto_6rem_10rem_minmax(0,1fr)_auto] gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await log(kind, Number(minutes), heldOn, note);
            if (!r.ok) return setError(r.error ?? "Couldn't log that.");
            setNote("");
            router.refresh();
          });
        }}
      >
        <label className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
          Type
          <select className="field w-full text-sm" value={kind} onChange={(e) => setKind(e.target.value as "review" | "support")}>
            <option value="review">Monthly review</option>
            <option value="support">Live support</option>
          </select>
        </label>
        <label className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
          Minutes
          <input className="field w-full text-sm" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
        </label>
        <label className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
          Date
          <input type="date" className="field w-full text-sm" value={heldOn} max={today} onChange={(e) => setHeldOn(e.target.value)} required />
        </label>
        <label className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
          Note (optional)
          <input className="field w-full text-sm" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What you covered" />
        </label>
        <button type="submit" className="btn btn-primary text-sm" disabled={pending}>{pending ? "Logging…" : "Log it"}</button>
      </form>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
      {sessions.length > 0 && (
        <ul className="text-sm divide-y" style={{ color: "var(--foreground)", borderColor: "var(--border)" }}>
          {sessions.map((x) => (
            <li key={x.id} className="py-2 flex gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
              <span className="font-semibold min-w-[7rem]">{x.kind === "review" ? "Monthly review" : "Live support"}</span>
              <span>{day(x.heldOn)} · {formatMinutes(x.minutes)}</span>
              {x.note && <span style={{ color: "var(--muted-foreground)" }}>{x.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
