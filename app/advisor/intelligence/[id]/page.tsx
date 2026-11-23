import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/advisor/ActionForm";
import { IntelligenceFields } from "@/components/advisor/IntelligenceFields";
import { requireRole } from "@/lib/auth/session";
import { CLASSIFICATIONS, EVIDENCE_LEVELS, INTELLIGENCE_STATUSES, INTELLIGENCE_TYPES } from "@/lib/cro";
import { croForUser, getIntelligence, listCroProfiles, listIntelligence } from "@/lib/data/cro";
import { recordStatusAction, saveRecordAction, stanceAction } from "../../cros/actions";

export const metadata = { title: "Intelligence record" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const STANCE = { author: "Author", co_author: "Co-author", endorses: "Endorses", disputes: "Sees it differently" } as const;

/** One record: its content and attribution, review (submit, validate, reject, retire), and other CROs' stances. */
export default async function IntelligenceRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const { id } = await params;
  const r = await getIntelligence(id);
  if (!r) notFound();
  const [cros, mine, all] = await Promise.all([listCroProfiles(), croForUser(user.id), listIntelligence()]);
  const isAuthor = Boolean(mine && r.stances.some((s) => s.croId === mine.id && (s.stance === "author" || s.stance === "co_author")));
  const canEdit = user.role === "admin" || (mine !== null && r.primaryCroId === mine.id);
  const canReview = user.role === "admin" || (Boolean(mine) && !isAuthor);
  const myStance = mine ? r.stances.find((s) => s.croId === mine.id) : undefined;
  const related = all.filter((o) => r.relatedIds.includes(o.id));
  const statusButton = (status: "draft" | "submitted" | "validated" | "rejected" | "retired", label: string) => (
    <ActionForm key={status} action={recordStatusAction.bind(null, r.id, status)} submit={label} label={label} className="inline-flex">
      <></>
    </ActionForm>
  );

  return (
    <div className="page space-y-8">
      <header>
        <Link href="/advisor/intelligence" className="link text-sm">← Intelligence library</Link>
        <h1 className="font-display text-3xl mt-2" style={fg}>{r.title}</h1>
        <p className="text-sm mt-1" style={muted}>
          {INTELLIGENCE_TYPES[r.type]} · {r.primaryCroName ?? "Growth Goaled network position"} · {CLASSIFICATIONS[r.classification]} · {EVIDENCE_LEVELS[r.evidence]} · version {r.version} · {INTELLIGENCE_STATUSES[r.status]}
          {r.validatedByName && r.validatedAt ? ` by ${r.validatedByName} on ${r.validatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
        </p>
      </header>

      {r.fromCommitmentId && (
        <p role="note" className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--amber-muted)", color: "var(--foreground)" }}>
          Drafted from a founder&apos;s commitment outcome. The company&apos;s name was taken out; check nothing else identifies them (people, clients, exact figures) before you submit it.
        </p>
      )}

      <section className="surface p-5 space-y-3" aria-label="Review">
        <h2 className="text-lg font-semibold" style={fg}>Review</h2>
        <p className="text-sm" style={muted}>
          {r.status === "validated" ? "Founders' conversations can use this record." : "Founders' conversations don't use this record until it's validated."} The author submits it; another CRO or an admin validates it.
        </p>
        <div className="flex gap-2 flex-wrap">
          {(isAuthor || user.role === "admin") && r.status === "draft" && statusButton("submitted", "Submit for review")}
          {(isAuthor || user.role === "admin") && r.status === "submitted" && statusButton("draft", "Back to draft")}
          {canReview && r.status !== "validated" && r.status !== "retired" && statusButton("validated", "Validate")}
          {canReview && r.status === "submitted" && statusButton("rejected", "Reject")}
          {canReview && r.status === "validated" && statusButton("retired", "Retire")}
        </div>
      </section>

      <section className="space-y-2" aria-label="Attribution">
        <h2 className="text-lg font-semibold" style={fg}>Who stands where</h2>
        <ul className="surface divide-y text-sm" style={{ borderColor: "var(--border)" }}>
          {r.stances.length === 0 && <li className="p-3" style={muted}>A network position, with no CRO attached yet.</li>}
          {r.stances.map((s) => (
            <li key={s.croId} className="p-3" style={{ borderColor: "var(--border)" }}>
              <span className="font-semibold" style={fg}>{s.croName}</span> <span style={s.stance === "disputes" ? { color: "var(--amber)" } : muted}>· {STANCE[s.stance]}</span>
              {s.note && <p className="mt-1" style={fg}>{s.note}</p>}
            </li>
          ))}
        </ul>
        {mine && !isAuthor && (
          <ActionForm action={stanceAction.bind(null, r.id)} submit="Save my stance" label="My stance" className="flex gap-2 items-end flex-wrap">
            <select name="stance" defaultValue={myStance?.stance ?? ""} className="field" aria-label="My stance">
              <option value="">No stance</option>
              <option value="endorses">I independently agree</option>
              <option value="disputes">I see it differently</option>
            </select>
            <input name="note" defaultValue={myStance?.note ?? ""} maxLength={1000} placeholder="Why (required if you see it differently)" aria-label="Why" className="field flex-1 min-w-[18rem]" />
          </ActionForm>
        )}
      </section>

      {related.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold" style={fg}>Related records</h2>
          <ul className="text-sm space-y-1">
            {related.map((o) => (
              <li key={o.id}>
                <Link href={`/advisor/intelligence/${o.id}`} className="link">{o.title}</Link> <span style={muted}>· {o.primaryCroName ?? "Network position"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit ? (
        <section className="surface p-5 space-y-3">
          <h2 className="text-lg font-semibold" style={fg}>Edit</h2>
          {r.status === "validated" && <p className="text-sm" style={{ color: "var(--amber)" }}>Changing the title or content makes a new version that needs validating again.</p>}
          <ActionForm action={saveRecordAction.bind(null, r.id)} submit="Save" label="Edit record" className="space-y-4">
            <IntelligenceFields
              record={{ ...r, coAuthorIds: r.stances.filter((s) => s.stance === "co_author").map((s) => s.croId) }}
              cros={cros}
              others={all.filter((o) => o.id !== r.id).map((o) => ({ id: o.id, title: o.title }))}
              lockedCroId={user.role === "admin" ? null : (mine?.id ?? null)}
              canCollective={user.role === "admin"}
            />
          </ActionForm>
        </section>
      ) : (
        <section className="surface p-5 space-y-2">
          <h2 className="text-lg font-semibold" style={fg}>Content</h2>
          <p className="text-base whitespace-pre-wrap" style={fg}>{r.content}</p>
          <p className="text-sm" style={muted}>{[r.category, r.tags.join(", "), r.stages.join(", "), r.industries.join(", "), r.source].filter(Boolean).join(" · ")}</p>
        </section>
      )}
    </div>
  );
}
