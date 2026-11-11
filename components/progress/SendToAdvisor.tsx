"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send } from "lucide-react";

/** Before the plan starts: send who-does-what to the advisor for review (then it's fixed). */
export function SendToAdvisor({ growthGoaled, total, send }: { growthGoaled: number; total: number; send: () => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div role="region" aria-label="Who does what" className="rounded-xl p-4 flex gap-4 items-center flex-wrap" style={{ background: "var(--green-muted)" }}>
      <div className="flex-1 min-w-[16rem]">
        <div className="font-semibold" style={{ color: "var(--foreground)" }}>Before you start: who does each action?</div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Choose <strong>Founder</strong> or <strong>Growth Goaled</strong> on each action, then send the plan to your advisor. They review it and quote any work Growth Goaled takes on.
          {" "}<strong style={{ color: "var(--foreground)" }}>{growthGoaled} of {total} with Growth Goaled.</strong>
        </p>
        {error && <p role="alert" className="text-sm mt-1" style={{ color: "var(--red)" }}>{error}</p>}
      </div>
      <button
        type="button"
        className="btn btn-primary inline-flex items-center gap-1.5"
        disabled={pending}
        onClick={() =>
          run(async () => {
            setError(null);
            const r = await send();
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        <Send size={15} aria-hidden /> {pending ? "Sending…" : "Send to my advisor for review"}
      </button>
    </div>
  );
}
