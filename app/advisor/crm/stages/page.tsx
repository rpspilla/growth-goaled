import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { pipeline } from "@/lib/data/crm";
import { addStageAction, deleteStageAction, moveStageAction, renameStageAction } from "../actions";

export const metadata = { title: "CRM columns" };

/** Rename, add, delete and reorder the board's columns. Deleting moves its contacts, never loses them. */
export default async function CrmStagesPage() {
  const user = await requireRole(["advisor", "admin"]);
  const { stages } = await pipeline(user);
  const muted = { color: "var(--muted-foreground)" };
  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl space-y-5">
      <Link href="/advisor/crm" className="link text-sm">← CRM</Link>
      <h1 className="font-display text-3xl" style={{ color: "var(--foreground)" }}>Columns</h1>
      <ol aria-label="Columns" className="surface divide-y">
        {stages.map((s, i) => (
          <li key={s.id} className="p-3 flex gap-2 items-center flex-wrap" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-col">
              <form action={moveStageAction.bind(null, s.id, -1)}><button type="submit" disabled={i === 0} aria-label={`Move ${s.name} left`} className="disabled:opacity-30"><ArrowUp size={14} /></button></form>
              <form action={moveStageAction.bind(null, s.id, 1)}><button type="submit" disabled={i === stages.length - 1} aria-label={`Move ${s.name} right`} className="disabled:opacity-30"><ArrowDown size={14} /></button></form>
            </div>
            <form action={renameStageAction.bind(null, s.id)} className="flex gap-2 flex-1 min-w-[12rem]">
              <input name="name" defaultValue={s.name} aria-label={`Rename ${s.name}`} maxLength={60} className="field flex-1" />
              <button type="submit" className="btn btn-secondary text-sm">Rename</button>
            </form>
            {stages.length > 1 && (
              <form action={deleteStageAction.bind(null, s.id)} className="flex gap-2 items-center">
                <select name="moveTo" aria-label={`Move ${s.name}'s contacts to`} className="field text-sm" defaultValue={stages[i === 0 ? 1 : 0]!.id}>
                  {stages.filter((x) => x.id !== s.id).map((x) => <option key={x.id} value={x.id}>Move contacts to {x.name}</option>)}
                </select>
                <button type="submit" className="text-sm" style={{ color: "var(--red)" }} aria-label={`Delete ${s.name}`}>Delete</button>
              </form>
            )}
          </li>
        ))}
      </ol>
      <form action={addStageAction} className="surface p-4 flex gap-2" aria-label="Add a column">
        <input name="name" required maxLength={60} placeholder="New column name" aria-label="New column name" className="field flex-1" />
        <button type="submit" className="btn btn-primary">Add column</button>
      </form>
      <p className="text-sm" style={muted}>New columns go just before &ldquo;Not Now / Archived&rdquo;. The summary counts follow each column&apos;s original meaning, even after a rename.</p>
    </div>
  );
}
