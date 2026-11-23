import Link from "next/link";
import { WorkbookImport } from "@/components/advisor/WorkbookImport";
import { requireRole } from "@/lib/auth/session";
import { croForUser, listCroProfiles } from "@/lib/data/cro";
import { importWorkbookAction, validateImportedAction } from "../../cros/actions";

export const metadata = { title: "Import a training workbook" };
export const maxDuration = 300;

const muted = { color: "var(--muted-foreground)" };

/** Import a CRO Training Workbook into the intelligence library (admins for any CRO; a CRO for themselves). */
export default async function WorkbookImportPage() {
  const user = await requireRole(["advisor", "admin"]);
  const [cros, mine] = await Promise.all([listCroProfiles(), croForUser(user.id)]);
  const canImport = user.role === "admin" || Boolean(mine);
  return (
    <div className="page space-y-6 max-w-4xl">
      <header>
        <Link href="/advisor/intelligence" className="link text-sm">← Intelligence library</Link>
        <h1 className="font-display text-3xl mt-2" style={{ color: "var(--foreground)" }}>Import a training workbook</h1>
        <p className="text-sm mt-1" style={muted}>
          Each scenario a CRO answered becomes a Scenario record attributed to them: the founder situation and question, their instinct, diagnosis, questions, recommendation, reasoning, what they wouldn&apos;t do, tradeoffs, what would change their mind, next actions, success metrics and how they&apos;d say it. Scenarios answered by several CROs are linked, with the workbook&apos;s discussion of their differences.
        </p>
      </header>
      {canImport ? (
        <WorkbookImport cros={cros.map((c) => ({ id: c.id, name: c.name }))} lockedCroId={user.role === "admin" ? null : (mine?.id ?? null)} canValidate={user.role === "admin"} importAction={importWorkbookAction} validateAction={validateImportedAction} />
      ) : (
        <p className="surface p-5 text-sm" style={muted}>To import your answers, an admin links your login to your CRO profile.</p>
      )}
    </div>
  );
}
