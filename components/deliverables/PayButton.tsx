"use client";

import { useState, useTransition } from "react";
import { startCheckout } from "@/app/(founder)/benchmark/actions";

export function PayButton({ price, disabled }: { price: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await startCheckout();
            if (r.ok) window.location.href = r.url;
            else setError(r.error);
          })
        }
        className="px-5 py-3 rounded-lg text-sm font-semibold disabled:opacity-60"
        style={{ background: "var(--green)", color: "#fff" }}
      >
        {pending ? "Opening secure checkout..." : `Unlock my benchmark · ${price}`}
      </button>
      <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
        {disabled ? "Payments aren't set up yet." : "Secure payment by Stripe. One-time, no subscription."}
      </p>
      {error && <p className="text-xs mt-1" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
