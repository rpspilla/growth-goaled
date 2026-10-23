"use client";

import { useTransition } from "react";

export function ReopenButton({ itemId, reopen }: { itemId: string; reopen: (id: string) => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => reopen(itemId))}
      className="text-xs px-3 py-1 rounded-md disabled:opacity-60"
      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
    >
      Reopen
    </button>
  );
}
