"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

/** Delete a person, with a confirm step; optionally the companies only they belong to. */
export function DeleteUser({ name, soleCompanies, remove }: { name: string; soleCompanies: string[]; remove: (withCompanies: boolean) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [open, setOpen] = useState(false);
  const [withCompanies, setWithCompanies] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`Delete ${name}`} title="Delete" className="p-1.5 rounded-md" style={{ color: "var(--red)" }}>
        <Trash2 size={15} />
      </button>
    );
  return (
    <div role="dialog" aria-label={`Delete ${name}?`} className="rounded-lg p-3 space-y-2 text-sm col-span-12" style={{ background: "var(--amber-muted)" }}>
      <div className="font-semibold" style={{ color: "var(--foreground)" }}>Delete {name}? This can&apos;t be undone.</div>
      {soleCompanies.length > 0 && (
        <label className="flex gap-2 items-start" style={{ color: "var(--foreground)" }}>
          <input type="checkbox" checked={withCompanies} onChange={(e) => setWithCompanies(e.target.checked)} className="mt-0.5" />
          <span>Also delete {soleCompanies.join(", ")} (they&apos;re the only member) and everything in it</span>
        </label>
      )}
      <div className="flex gap-2 items-center">
        <button
          type="button"
          disabled={pending}
          className="btn text-sm"
          style={{ background: "var(--red)", color: "#fff" }}
          onClick={() =>
            run(async () => {
              setError(null);
              const r = await remove(withCompanies);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
        >
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => setOpen(false)}>Cancel</button>
        {error && <span role="alert" style={{ color: "var(--red)" }}>{error}</span>}
      </div>
    </div>
  );
}
