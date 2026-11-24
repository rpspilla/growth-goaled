import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, ne } from "drizzle-orm";
import { ActionForm } from "@/components/advisor/ActionForm";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { INTELLIGENCE_STATUSES, INTELLIGENCE_TYPES, PHILOSOPHY_FIELDS, STYLE_FIELDS } from "@/lib/cro";
import { getCroProfile, listIntelligence } from "@/lib/data/cro";
import { croAdminAction, removeCroPhotoAction, saveCroAction, uploadCroPhotoAction } from "../actions";
import { CroPhotoUpload } from "@/components/advisor/CroPhotoUpload";

export const metadata = { title: "CRO profile" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

function Field({ name, label, value, rows, hint }: { name: string; label: string; value: string | null | undefined; rows?: number; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {hint && <span className="block text-xs" style={muted}>{hint}</span>}
      {rows ? <textarea name={name} defaultValue={value ?? ""} rows={rows} className="field w-full mt-1" aria-label={label} /> : <input name={name} defaultValue={value ?? ""} className="field w-full mt-1" aria-label={label} />}
    </label>
  );
}

/**
 * One CRO's profile, in their own words: background, expertise (tagged), philosophy and how they
 * communicate. The AI representation uses exactly what's written here and their validated records,
 * nothing inferred. Admins also publish, keep in the Collective, and link the CRO's login.
 */
export default async function CroProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const cro = await getCroProfile(id);
  if (!cro) notFound();
  const canEdit = user.role === "admin" || cro.userId === user.id;
  const [records, staff] = await Promise.all([
    listIntelligence({ croId: cro.id }),
    user.role === "admin" ? db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).where(ne(schema.users.role, "founder")) : Promise.resolve([]),
  ]);
  const [linked] = cro.userId ? await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, cro.userId)).limit(1) : [];
  const save = saveCroAction.bind(null, cro.id);

  return (
    <div className="page space-y-8">
      <header>
        <Link href="/advisor/cros" className="link text-sm">← CRO network</Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <h1 className="font-display text-3xl" style={fg}>{cro.name}</h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={cro.status === "published" ? { background: "var(--green-muted)", color: "var(--green)" } : { background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {cro.status === "published" ? "Published" : "Draft"}
          </span>
          {cro.status === "published" && <Link href={`/cros/${cro.slug}`} className="link text-sm">As founders see it →</Link>}
        </div>
        <p className="text-sm mt-1" style={muted}>
          {linked ? `Linked to ${linked.name || linked.email}'s login.` : "No login linked yet."} {cro.inCollective ? "Part of the Growth Goaled Collective." : "Not part of the Collective."}
        </p>
      </header>

      {user.role === "admin" && (
        <section className="surface p-5 space-y-3" aria-label="Publishing">
          <h2 className="text-lg font-semibold" style={fg}>Publishing</h2>
          <ActionForm action={croAdminAction.bind(null, cro.id)} submit="Save" label="Publishing" className="flex gap-4 items-end flex-wrap">
            <label className="block">
              <span className="label">Founders</span>
              <select name="status" defaultValue={cro.status} className="field mt-1" aria-label="Status">
                <option value="draft">Draft: not shown to founders</option>
                <option value="published">Published: founders can talk to their AI</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="inCollective" defaultChecked={cro.inCollective} /> Part of the Collective
            </label>
            <label className="block">
              <span className="label">Their login</span>
              <select name="userId" defaultValue={cro.userId ?? ""} className="field mt-1" aria-label="Login">
                <option value="">None</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.email}</option>
                ))}
              </select>
            </label>
          </ActionForm>
        </section>
      )}

      {canEdit ? (
        <ActionForm action={save} submit="Save profile" label="CRO profile" className="space-y-8">
          <section className="surface p-5 space-y-4">
            <h2 className="text-lg font-semibold" style={fg}>Identity and background</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <CroPhotoUpload name={cro.name} photoUrl={cro.photoUrl} upload={uploadCroPhotoAction.bind(null, cro.id)} remove={removeCroPhotoAction.bind(null, cro.id)} />
              <Field name="name" label="Name" value={cro.name} />
              <Field name="headline" label="Headline" value={cro.headline} />
              <Field name="linkedinUrl" label="Career history: LinkedIn profile link" value={cro.linkedinUrl} hint="e.g. https://www.linkedin.com/in/their-name" />
              <Field name="websiteUrl" label="Website profile (https link)" value={cro.websiteUrl} />
            </div>
            <Field name="bio" label="Professional biography" value={cro.bio} rows={4} />
            <Field name="accomplishments" label="Relevant accomplishments" value={cro.accomplishments} rows={3} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="availableForAdvisory" defaultChecked={cro.availableForAdvisory} /> Available for human advisory engagements
            </label>
          </section>

          <section className="surface p-5 space-y-4">
            <h2 className="text-lg font-semibold" style={fg}>Expertise</h2>
            <p className="text-sm" style={muted}>Comma-separated tags; founders and the Collective search on them.</p>
            <div className="grid md:grid-cols-2 gap-4">
              <Field name="expertise" label="Areas of expertise" value={cro.expertise.join(", ")} hint="e.g. sales hiring, founder-led sales, pricing, retention" />
              <Field name="functions" label="Functional experience" value={cro.functions.join(", ")} hint="e.g. sales, marketing, customer success, revops" />
              <Field name="industries" label="Industries" value={cro.industries.join(", ")} hint="e.g. SaaS, AI, Fintech, Healthcare" />
              <Field name="stages" label="Company stages" value={cro.stages.join(", ")} hint="e.g. Seed, Series A" />
              <Field name="companyTypes" label="Company types" value={cro.companyTypes.join(", ")} hint="e.g. B2B SaaS, marketplace, usage-based" />
            </div>
          </section>

          <section className="surface p-5 space-y-4">
            <h2 className="text-lg font-semibold" style={fg}>Philosophy, in their words</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(PHILOSOPHY_FIELDS).map(([k, label]) => (
                <Field key={k} name={`philosophy.${k}`} label={label} value={cro.philosophy[k as keyof typeof cro.philosophy]} rows={3} />
              ))}
            </div>
          </section>

          <section className="surface p-5 space-y-4">
            <h2 className="text-lg font-semibold" style={fg}>How they communicate</h2>
            <p className="text-sm" style={muted}>From the CRO&apos;s own description and examples, never inferred. The AI matches this style.</p>
            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(STYLE_FIELDS).map(([k, label]) => (
                <Field key={k} name={`style.${k}`} label={label} value={cro.style[k as keyof typeof cro.style]} rows={k === "exampleInTheirWords" ? 5 : 2} />
              ))}
            </div>
          </section>
        </ActionForm>
      ) : (
        <p className="surface p-5 text-sm" style={muted}>Only {cro.name} or an admin can edit this profile.</p>
      )}

      <section className="space-y-3" aria-label="Their intelligence">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold" style={fg}>Their intelligence · {records.length}</h2>
          <Link href={`/advisor/intelligence?cro=${cro.id}`} className="link text-sm">Open in the library →</Link>
        </div>
        {records.length ? (
          <ul className="surface divide-y text-sm" style={{ borderColor: "var(--border)" }}>
            {records.map((r) => {
              const mine = r.stances.find((s) => s.croId === cro.id);
              return (
                <li key={r.id} className="p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
                  <Link href={`/advisor/intelligence/${r.id}`} className="link flex-1 min-w-[14rem]">{r.title}</Link>
                  <span style={muted}>{INTELLIGENCE_TYPES[r.type]}</span>
                  <span style={muted}>{r.primaryCroId === cro.id ? "Author" : mine?.stance === "co_author" ? "Co-author" : mine?.stance === "endorses" ? "Endorses" : "Disputes"}</span>
                  <span style={muted}>{INTELLIGENCE_STATUSES[r.status]}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="surface p-4 text-sm" style={muted}>No records yet.</p>
        )}
      </section>
    </div>
  );
}
