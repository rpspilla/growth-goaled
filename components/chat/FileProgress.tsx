"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

const STEPS = ["Uploading", "Reading the file", "Pulling out the figures", "Checking them against what you've told us", "Adding them to your company's numbers"];

/**
 * A file on its way in: a bar that keeps filling, the step it's on and a clock, so a long read never
 * looks frozen. `since` (when it was shared) keeps the clock right across page refreshes.
 */
export function FileProgress({ filename, since, uploading = false, tone = "dark" }: { filename: string; since?: string | null; uploading?: boolean; tone?: "dark" | "light" }) {
  const start = since ? new Date(since).getTime() : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const [mounted] = useState(() => Date.now());
  const seconds = now === null ? 0 : Math.max(0, Math.floor((now - (start ?? mounted)) / 1000));
  // Uploading is the first step; after that the steps move on every ~12 seconds, holding on the last.
  const at = uploading ? 0 : Math.min(STEPS.length - 1, 1 + Math.floor(seconds / 12));
  const share = uploading ? Math.min(0.2, 0.05 + seconds / 100) : Math.min(0.95, 0.2 + 0.8 * (1 - Math.exp(-seconds / 30)));
  const text = tone === "dark" ? "#fff" : "var(--foreground)";
  const quiet = tone === "dark" ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)";
  const clock = seconds < 120 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Larger files take a few minutes. It's still working; you can keep talking meanwhile.";
  return (
    <div className="mt-2 space-y-1.5 text-sm" role="status" aria-live="polite">
      <div className="flex items-center gap-2" style={{ color: text }}>
        <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
        <span className="truncate">{uploading ? "Uploading" : "Reading"} {filename}…</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: tone === "dark" ? "rgba(255,255,255,0.18)" : "var(--muted)" }} role="progressbar" aria-label={`Reading ${filename}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, share * 100)}%`, background: "#3DDC97", transition: "width 1s linear" }} />
      </div>
      <ol className="space-y-0.5" aria-label="Progress">
        {STEPS.slice(0, at + 1).map((label, i) => (
          <li key={label} className="flex items-center gap-2" style={{ color: i === at ? text : quiet }}>
            {i === at ? <Loader2 size={12} className="animate-spin shrink-0" aria-hidden /> : <Check size={12} className="shrink-0" aria-hidden />}
            {label}
            {i === at && "…"}
          </li>
        ))}
      </ol>
      <p className="text-xs tabular-nums" style={{ color: quiet }}>{clock}</p>
    </div>
  );
}
