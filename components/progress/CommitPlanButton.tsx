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
      <div className="inline-flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold rounded-full px-3 py-1" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
          ✓ You committed to this plan on {new Date(committedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
        </span>
        <Link href="/progress" className="btn btn-primary btn-sm">Track progress →</Link>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-3 flex-wrap">
      <button
        title="Track each action and its metric against today's baseline, and get a reminder of when to reassess."
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
