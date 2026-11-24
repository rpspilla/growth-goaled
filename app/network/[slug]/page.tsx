import Link from "next/link";
import { notFound } from "next/navigation";
import { PHILOSOPHY_FIELDS } from "@/lib/cro";
import { publishedCro } from "@/lib/data/cro";

export const dynamic = "force-dynamic";

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const cro = await publishedCro((await params).slug);
  return cro ? { title: `${cro.name} · Growth Goaled`, description: cro.headline ?? `Talk to ${cro.name}'s AI CRO.` } : { title: "Growth Goaled" };
}

/**
 * A CRO's public page: who they are, their experience, expertise, industries and stages, philosophy,
 * approach and strengths, and their AI CRO to talk to (the website chat, with them chosen).
 */
export default async function PublicCroPage({ params }: { params: Promise<{ slug: string }> }) {
  const cro = await publishedCro((await params).slug);
  if (!cro) notFound();
  const first = cro.name.split(" ")[0];
  const philosophy = Object.entries(PHILOSOPHY_FIELDS).flatMap(([k, label]) => {
    const v = cro.philosophy[k as keyof typeof cro.philosophy];
    return v ? [{ label, v }] : [];
  });
  const approach = [cro.style.diagnosticMethods, cro.style.decisionApproach, cro.style.coaching].filter(Boolean) as string[];
  return (
    <div className="space-y-10">
      <Link href="/network" className="link text-sm">← All CROs</Link>
      <header className="flex items-center gap-5 flex-wrap">
        {cro.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cro.photoUrl} alt="" className="w-24 h-24 rounded-full object-cover" />
        )}
        <div className="flex-1 min-w-[16rem]">
          <h1 className="font-display text-4xl sm:text-5xl" style={fg}>{cro.name}</h1>
          {cro.headline && <p className="text-lg mt-1" style={muted}>{cro.headline}</p>}
          <div className="flex gap-4 flex-wrap">
            {cro.linkedinUrl && <a href={cro.linkedinUrl} target="_blank" rel="noopener" className="link text-sm">Career history on LinkedIn</a>}
          </div>
        </div>
      </header>

      <section aria-label={`${first}'s AI CRO`} className="surface p-6 space-y-2" style={{ borderColor: "var(--green)" }}>
        <h2 className="text-2xl font-semibold" style={fg}>Talk to {first}&apos;s AI CRO</h2>
        <p className="text-base max-w-3xl" style={muted}>
          An AI built from {cro.name}&apos;s documented expertise, frameworks and judgment: not {first} in person. Ask about the growth decision in front of you; it&apos;s free to start.
          {cro.availableForAdvisory ? ` ${first} also takes on advisory work in person.` : ""}
        </p>
        <Link href={`/sign-in?cro=${cro.slug}`} className="btn btn-primary inline-block">Talk to {first}&apos;s AI CRO</Link>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {cro.bio && (
          <section className="surface p-6 space-y-3">
            <h2 className="text-xl font-semibold" style={fg}>Who {first} is</h2>
            {cro.bio && <p className="text-base whitespace-pre-wrap" style={fg}>{cro.bio}</p>}
          </section>
        )}
        <section className="surface p-6 space-y-3" aria-label="Expertise">
          <h2 className="text-xl font-semibold" style={fg}>Expertise</h2>
          <dl className="text-base space-y-1">
            {([["Areas", cro.expertise], ["Industries", cro.industries], ["Stages", cro.stages], ["Company types", cro.companyTypes], ["Functions", cro.functions]] as const).map(([label, v]) =>
              v.length ? (
                <div key={label} className="flex gap-2 flex-wrap">
                  <dt className="font-semibold" style={fg}>{label}:</dt>
                  <dd style={muted}>{v.join(", ")}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {cro.accomplishments && (
            <>
              <h3 className="text-base font-semibold pt-2" style={fg}>Strengths and accomplishments</h3>
              <p className="text-base whitespace-pre-wrap" style={muted}>{cro.accomplishments}</p>
            </>
          )}
        </section>
      </div>

      {philosophy.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold" style={fg}>{first}&apos;s CRO philosophy</h2>
          <dl className="grid md:grid-cols-2 gap-4">
            {philosophy.map((p) => (
              <div key={p.label} className="surface p-5">
                <dt className="text-sm font-semibold" style={muted}>{p.label}</dt>
                <dd className="text-base mt-1 whitespace-pre-wrap" style={fg}>{p.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {approach.length > 0 && (
        <section className="surface p-6 space-y-2">
          <h2 className="text-xl font-semibold" style={fg}>How {first} works with founders</h2>
          {approach.map((a, i) => (
            <p key={i} className="text-base whitespace-pre-wrap" style={fg}>{a}</p>
          ))}
        </section>
      )}
    </div>
  );
}
