"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { verifySourceAction } from "@/app/advisor/benchmark-library/actions";

/** Records that someone checked the source today (link works, terms unchanged). */
export function VerifySourceButton({ id, verify }: { id: string; verify: typeof verifySourceAction }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await verify(id); router.refresh(); })} className="text-xs font-semibold disabled:opacity-50" style={{ color: "var(--green)" }}>
      {pending ? "Saving…" : "Mark verified today"}
    </button>
  );
}
