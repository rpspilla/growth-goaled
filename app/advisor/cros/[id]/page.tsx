import { createHash } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, ne } from "drizzle-orm";
import { ActionForm } from "@/components/advisor/ActionForm";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { INTELLIGENCE_STATUSES, INTELLIGENCE_TYPES, PHILOSOPHY_FIELDS, STYLE_FIELDS, VOICE_QUESTIONS } from "@/lib/cro";
import { getCroProfile, listIntelligence } from "@/lib/data/cro";
import { croAdminAction, generateBioAction, generateVoiceAction, linkVoiceAction, rallyVoiceAction, removeCroPhotoAction, removeVoiceAction, saveCroAction, uploadCroPhotoAction } from "../actions";
import { CroVoice } from "@/components/advisor/CroVoice";
import { voiceConfigured } from "@/lib/ai/voice";
import { CroBioFromLinkedIn } from "@/components/advisor/CroBioFromLinkedIn";
import { CroVoiceQuestions } from "@/components/advisor/CroVoiceQuestions";
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
 * One CRO's profile: photo, LinkedIn, a biography written from their LinkedIn PDF, expertise (tagged),
 * their answers to two founder questions, and the philosophy and communication boxes drafted from
 * those answers (all editable). The AI uses exactly what's saved here and their validated records.
 * Admins also publish, keep in the Collective, and link the CRO's login.
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
  // The drafted boxes remount only when their saved text changes (a draft from LinkedIn or the two
  // answers), so a photo upload never clears what's being typed.
  const version = createHash("sha1").update(JSON.stringify([cro.bio, cro.philosophy, cro.style])).digest("hex").slice(0, 12);

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
          {linked ? `Linked to ${linked.name || linked.email}'s login.` : "No login linked yet."} {cro.inCollective ? "Part of the Rally Collective." : "Not part of the Collective."}
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
              <Field name="title" label="Title" value={cro.title} hint="Shown with their name in Rally, e.g. Cofounding CRO, Growth Goaled" />
              <Field name="headline" label="Credibility line" value={cro.headline} hint="One sentence on why founders should listen, e.g. Built and scaled B2B revenue teams from Seed to Series C" />
              <Field name="linkedinUrl" label="Career history: LinkedIn profile link" value={cro.linkedinUrl} hint="e.g. https://www.linkedin.com/in/their-name" />
            </div>
            <CroBioFromLinkedIn key={`bio-${version}`} bio={cro.bio} hasLinkedin={Boolean(cro.linkedinUrl)} generate={generateBioAction.bind(null, cro.id)} />
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

          <CroVoiceQuestions questions={VOICE_QUESTIONS} answers={cro.voiceAnswers} generate={generateVoiceAction.bind(null, cro.id)} />

          <section key={`philosophy-${version}`} className="surface p-5 space-y-4">
            <h2 className="text-lg font-semibold" style={fg}>Philosophy, in their words</h2>
            <p className="text-sm" style={muted}>Filled in from the two answers above; edit anything that isn&apos;t how they think.</p>
            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(PHILOSOPHY_FIELDS).map(([k, label]) => (
                <Field key={k} name={`philosophy.${k}`} label={label} value={cro.philosophy[k as keyof typeof cro.philosophy]} rows={3} />
              ))}
            </div>
          </section>

          <section key={`style-${version}`} className="surface p-5 space-y-4">
            <h2 className="text-lg font-semibold" style={fg}>How they communicate</h2>
            <p className="text-sm" style={muted}>Filled in from the two answers above. The AI matches this style; edit anything that doesn&apos;t sound like them.</p>
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

      {cro.userId === user.id ? (
        <CroVoice croId={cro.id} name={cro.name} voiceReady={Boolean(cro.voiceId)} isRallyVoice={cro.rallyVoice} setRally={rallyVoiceAction} configured={voiceConfigured()} link={linkVoiceAction} remove={removeVoiceAction} />
      ) : (
        <p className="surface p-4 text-sm" style={muted}>
          {cro.voiceId ? `✓ ${cro.name}'s voice is set up: Rally reads their AI's answers in it.` : `Rally reads ${cro.name.split(" ")[0]}'s answers in a standard voice until they record their own (only they can, from their login).`}
        </p>
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
