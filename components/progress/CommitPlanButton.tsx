"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok: true } | { ok: false; error: string };

/** Under the plan: commit to it (saves the actions and baseline for Progress), or a link once committed. */
export function CommitPlanButton({ committedAt, commit }: { committedAt: string | null; commit: () => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (committedAt) {
    return (
      <div className="rounded-xl px-5 py-4 text-base flex items-center gap-3 flex-wrap" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
        <span className="flex-1">
          <span style={{ color: "var(--green)" }}>✓</span> You committed to this plan on {new Date(committedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
        </span>
        <Link href="/progress" className="btn btn-primary btn-sm">Track progress →</Link>
      </div>
    );
  }
  return (
    <div className="surface px-5 py-4 text-base flex items-center gap-4 flex-wrap">
      <span className="flex-1" style={{ color: "var(--muted-foreground)" }}>
        Commit to this plan to track each action and its metric against today&apos;s baseline, and get a reminder of when to reassess.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await commit();
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
        className="btn btn-primary"
      >
        {pending ? "Saving…" : "Commit to this plan"}
      </button>
      {error && <span className="text-sm w-full" role="alert" style={{ color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
