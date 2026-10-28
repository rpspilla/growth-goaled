"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { card, inputClass, inputStyle, primary } from "@/components/benchmarks/ui";
import type { saveDatasetAction } from "@/app/advisor/benchmark-library/actions";

/** Create or edit a dataset's name, description, source and the companies it applies to. */
export function DatasetForm({
  sources,
  dataset,
  action,
}: {
  sources: { id: string; name: string; publisher: string | null }[];
  dataset?: { id: string; name: string; description: string | null; sourceId: string; companyTypes: string[]; businessModels: string[] };
  action: typeof saveDatasetAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && !dataset && state.id) router.push(`/advisor/benchmark-library/${state.id}`);
  }, [state, dataset, router]);
  return (
    <form action={formAction} className="rounded-xl border p-5 space-y-3" style={card}>
      {dataset && <input type="hidden" name="id" value={dataset.id} />}
      <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
        Dataset name
        <input name="name" defaultValue={dataset?.name} className={`${inputClass} mt-1`} style={inputStyle} />
      </label>
      <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
        Source
        <select name="sourceId" defaultValue={dataset?.sourceId ?? ""} className={`${inputClass} mt-1`} style={inputStyle}>
          <option value="" disabled>Choose a source</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}{s.publisher ? ` · ${s.publisher}` : ""}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
        Description
        <textarea name="description" rows={2} defaultValue={dataset?.description ?? ""} className={`${inputClass} mt-1`} style={inputStyle} />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          Applies to company types (comma separated)
          <input name="companyTypes" defaultValue={dataset?.companyTypes.join(", ")} placeholder="e.g. B2B SaaS, AI" className={`${inputClass} mt-1`} style={inputStyle} />
        </label>
        <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          Business models (comma separated)
          <input name="businessModels" defaultValue={dataset?.businessModels.join(", ")} placeholder="e.g. Subscription, Usage-based" className={`${inputClass} mt-1`} style={inputStyle} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={primary}>{pending ? "Saving…" : dataset ? "Save details" : "Create dataset"}</button>
        {state && !state.ok && <span className="text-sm" role="alert" style={{ color: "var(--red)" }}>{state.error}</span>}
        {state?.ok && dataset && <span className="text-sm" role="status" style={{ color: "var(--green)" }}>Saved.</span>}
      </div>
    </form>
  );
}
