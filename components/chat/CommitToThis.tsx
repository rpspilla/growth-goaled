"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, ListChecks } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { CommitState } from "@/app/(founder)/chat/actions";
import type { CommitmentDraft } from "@/lib/commitments";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? "Saving…" : "Commit"}
    </button>
  );
}

/**
 * "Commit to this" under a decision card (AI CRO sprint, Nov 23, 2026): the card's next steps as
 * commitments (who, by when, how you'll know), into a new growth project or an open one. Once saved,
 * the card links to the project instead.
 */
export function CommitToThis({
  proposals,
  projectName,
  openProjects,
  committed,
  commit,
  saved = false,
  save,
}: {
  proposals: CommitmentDraft[];
  projectName: string;
  openProjects: { id: string; name: string }[];
  /** The project it was committed to, when it already has been. */
  committed: { id: string; name: string } | null;
  commit: (prev: CommitState, formData: FormData) => Promise<CommitState>;
  /** Saved for later under Decisions (a bookmark), and how to toggle it. */
  saved?: boolean;
  save?: (saved: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [state, action] = useActionState(commit, {});
  const [open, setOpen] = useState(false);
  const [isSaved, setSaved] = useState(saved);
  const [saving, startSave] = useTransition();
  const [project, setProject] = useState("new");
  const done = committed ?? (state.projectId ? { id: state.projectId, name: null } : null);

  if (done) {
    return (
      <div role="status" className="rounded-xl px-4 py-3 text-base flex items-center gap-3 flex-wrap" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
        <span className="font-semibold" style={{ color: "var(--green)" }}>Committed.</span>
        <span>Rally follows up on these steps{done.name ? ` in ${done.name}` : ""}.</span>
        <Link href={`/projects/${done.id}`} className="link">Open the growth project →</Link>
        <Link href="/decisions" className="link">All decisions</Link>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {save && (
            <button
              type="button"
              aria-pressed={isSaved}
              disabled={saving}
              className="btn btn-secondary text-sm py-1.5 inline-flex items-center gap-1.5"
              onClick={() =>
                startSave(async () => {
                  const r = await save(!isSaved);
                  if (r.ok) setSaved(!isSaved);
                })
              }
            >
              {isSaved ? <BookmarkCheck size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
              {isSaved ? "Saved to Decisions" : "Save recommendation"}
            </button>
          )}
          {proposals.length > 0 && (
            <button type="button" className="btn btn-primary text-sm py-1.5 inline-flex items-center gap-1.5" onClick={() => setOpen(true)}>
              <ListChecks size={16} aria-hidden /> Commit to this
            </button>
          )}
        </div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          <strong className="font-semibold">Save</strong> keeps it under <Link href="/decisions" className="link">Decisions</Link> to come back to. <strong className="font-semibold">Commit</strong> turns its next steps into tasks with owners and dates that Rally follows up on. This conversation is saved either way.
        </p>
      </div>
    );
  }
  return (
    <form action={action} aria-label="Commit to this recommendation" className="surface p-5 space-y-4">
      <div>
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Commit to this</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Keep the steps you&apos;ll do, say who owns each and by when. Your CRO will ask about them.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Growth project</span>
          <select name="project" value={project} onChange={(e) => setProject(e.target.value)} className="field w-full mt-1">
            <option value="new">A new growth project</option>
            {openProjects.map((p) => (
              <option key={p.id} value={p.id}>
                Add to: {p.name}
              </option>
            ))}
          </select>
        </label>
        {project === "new" && (
          <label className="block">
            <span className="label">Project name</span>
            <input name="project_name" defaultValue={projectName} maxLength={120} required className="field w-full mt-1" />
          </label>
        )}
      </div>
      <input type="hidden" name="rows" value={proposals.length} />
      <ol className="space-y-3" aria-label="Commitments">
        {proposals.map((p, n) => (
          <li key={n} className="rounded-xl p-3 space-y-2" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-start gap-2">
              <input type="checkbox" name={`keep_${n}`} defaultChecked className="mt-1.5" aria-label={`Keep commitment ${n + 1}`} />
              <textarea name={`title_${n}`} defaultValue={p.title} rows={2} maxLength={300} aria-label={`Commitment ${n + 1}`} className="field w-full flex-1" />
            </div>
            <div className="grid sm:grid-cols-3 gap-2 pl-6">
              <label className="block text-sm">
                <span className="label">Owner</span>
                <input name={`owner_${n}`} defaultValue={p.owner} maxLength={80} aria-label={`Owner of commitment ${n + 1}`} className="field w-full mt-1" />
              </label>
              <label className="block text-sm">
                <span className="label">Due</span>
                <input type="date" name={`due_${n}`} defaultValue={p.dueOn ?? ""} aria-label={`Due date of commitment ${n + 1}`} className="field w-full mt-1" />
              </label>
              <label className="block text-sm">
                <span className="label">How you&apos;ll know it worked</span>
                <input name={`measure_${n}`} defaultValue={p.measure ?? ""} maxLength={300} aria-label={`Measure of commitment ${n + 1}`} className="field w-full mt-1" />
              </label>
            </div>
          </li>
        ))}
      </ol>
      {state.error && (
        <p role="alert" className="text-base" style={{ color: "var(--red)" }}>
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Save />
        <button type="button" className="link text-sm" onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
    </form>
  );
}
