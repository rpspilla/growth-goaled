import { CLASSIFICATIONS, EVIDENCE_LEVELS, INTELLIGENCE_TYPES } from "@/lib/cro";
import type { CroIntelligence, CroProfile } from "@/lib/db/schema";

const muted = { color: "var(--muted-foreground)" };

/**
 * The fields of a CRO intelligence record (used inside an ActionForm): what it is, its content,
 * where it applies, who it's attributed to, how well it's backed, and where the AI may use it.
 */
export function IntelligenceFields({
  record,
  cros,
  others,
  lockedCroId,
  canCollective,
}: {
  record: Partial<CroIntelligence> & { coAuthorIds?: string[] };
  cros: Pick<CroProfile, "id" | "name">[];
  /** Other records, to link as related. */
  others: { id: string; title: string }[];
  /** A CRO writing their own record: attributed to them, no choice. */
  lockedCroId: string | null;
  /** Admins may record a collective (network) position. */
  canCollective: boolean;
}) {
  const modes = record.modes ?? ["individual", "collective"];
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <label className="block">
          <span className="label">Type</span>
          <select name="type" defaultValue={record.type ?? "principle"} className="field w-full mt-1" aria-label="Type">
            {Object.entries(INTELLIGENCE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Category</span>
          <input name="category" defaultValue={record.category ?? ""} maxLength={120} placeholder="e.g. First sales hire" className="field w-full mt-1" aria-label="Category" />
        </label>
        <label className="block">
          <span className="label">Evidence</span>
          <select name="evidence" defaultValue={record.evidence ?? "opinion"} className="field w-full mt-1" aria-label="Evidence">
            {Object.entries(EVIDENCE_LEVELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Title</span>
        <input name="title" required defaultValue={record.title ?? ""} maxLength={200} className="field w-full mt-1" aria-label="Title" />
      </label>
      <label className="block">
        <span className="label">Content</span>
        <span className="block text-xs" style={muted}>In the CRO&apos;s own words: the principle, the framework&apos;s steps, the scenario and what they did, the outcome and the lesson.</span>
        <textarea name="content" required defaultValue={record.content ?? ""} rows={8} maxLength={8000} className="field w-full mt-1" aria-label="Content" />
      </label>
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="label">Tags</span>
          <input name="tags" defaultValue={(record.tags ?? []).join(", ")} placeholder="vp of sales, founder-led sales, $1-3m arr" className="field w-full mt-1" aria-label="Tags" />
        </label>
        <label className="block">
          <span className="label">Expertise areas</span>
          <input name="expertise" defaultValue={(record.expertise ?? []).join(", ")} placeholder="sales hiring, organizational design" className="field w-full mt-1" aria-label="Expertise areas" />
        </label>
        <label className="block">
          <span className="label">Company stages</span>
          <input name="stages" defaultValue={(record.stages ?? []).join(", ")} placeholder="Seed, Series A" className="field w-full mt-1" aria-label="Company stages" />
        </label>
        <label className="block">
          <span className="label">Industries</span>
          <input name="industries" defaultValue={(record.industries ?? []).join(", ")} placeholder="SaaS, Fintech" className="field w-full mt-1" aria-label="Industries" />
        </label>
        <label className="block">
          <span className="label">Company types</span>
          <input name="companyTypes" defaultValue={(record.companyTypes ?? []).join(", ")} placeholder="B2B SaaS, usage-based" className="field w-full mt-1" aria-label="Company types" />
        </label>
        <label className="block">
          <span className="label">Source</span>
          <input name="source" defaultValue={record.source ?? ""} maxLength={500} placeholder="e.g. Advisory call notes, Mar 2026; anonymised client" className="field w-full mt-1" aria-label="Source" />
        </label>
      </div>

      <fieldset className="grid md:grid-cols-3 gap-4">
        <legend className="label mb-1">Attribution</legend>
        <label className="block">
          <span className="text-sm" style={muted}>Whose it is</span>
          <select name="classification" defaultValue={record.classification ?? "individual"} className="field w-full mt-1" aria-label="Classification">
            {Object.entries(CLASSIFICATIONS)
              .filter(([k]) => k !== "collective" || canCollective)
              .map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm" style={muted}>Primary CRO</span>
          {lockedCroId ? (
            <>
              <input type="hidden" name="primaryCroId" value={lockedCroId} />
              <input disabled value={cros.find((c) => c.id === lockedCroId)?.name ?? ""} className="field w-full mt-1" aria-label="Primary CRO" />
            </>
          ) : (
            <select name="primaryCroId" defaultValue={record.primaryCroId ?? ""} className="field w-full mt-1" aria-label="Primary CRO">
              <option value="">None (network position)</option>
              {cros.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </label>
        <label className="block">
          <span className="text-sm" style={muted}>Co-authors (joint work)</span>
          <select name="coAuthorIds" multiple defaultValue={record.coAuthorIds ?? []} className="field w-full mt-1 h-24" aria-label="Co-authors">
            {cros
              .filter((c) => c.id !== (lockedCroId ?? record.primaryCroId))
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </label>
      </fieldset>

      <div className="grid md:grid-cols-2 gap-4">
        <fieldset>
          <legend className="label mb-1">Where the AI may use it</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="modes" value="individual" defaultChecked={modes.includes("individual")} /> In this CRO&apos;s own conversations
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="modes" value="collective" defaultChecked={modes.includes("collective")} /> In the Growth Goaled Collective
          </label>
        </fieldset>
        {others.length > 0 && (
          <label className="block">
            <span className="label">Related records</span>
            <select name="relatedIds" multiple defaultValue={record.relatedIds ?? []} className="field w-full mt-1 h-24" aria-label="Related records">
              {others.map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
