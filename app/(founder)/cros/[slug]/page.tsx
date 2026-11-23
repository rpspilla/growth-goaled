import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AskBox } from "@/components/chat/AskBox";
import { CHAT_TOPICS } from "@/lib/chat/topics";
import { PHILOSOPHY_FIELDS } from "@/lib/cro";
import { founderContext } from "@/lib/data/founder-context";
import { publishedCro } from "@/lib/data/cro";
import { startChatAction } from "../../chat/actions";

export const metadata = { title: "CRO" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

/** One CRO, as founders see them: who they are, what they know, how they think, and their AI to ask. */
export default async function CroPage({ params }: { params: Promise<{ slug: string }> }) {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const { slug } = await params;
  const cro = await publishedCro(slug);
  if (!cro) notFound();
  const first = cro.name.split(" ")[0];
  const philosophy = Object.entries(PHILOSOPHY_FIELDS).flatMap(([k, label]) => {
    const v = cro.philosophy[k as keyof typeof cro.philosophy];
    return v ? [{ label, v }] : [];
  });
  return (
    <div className="page space-y-8">
      <div>
        <Link href="/cros" className="link text-sm">← Our CROs</Link>
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {cro.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cro.photoUrl} alt="" className="w-20 h-20 rounded-full object-cover" />
          )}
          <div>
            <h1 className="font-display text-3xl sm:text-4xl" style={fg}>{cro.name}</h1>
            {cro.headline && <p className="text-lg" style={muted}>{cro.headline}</p>}
            {cro.websiteUrl && <a href={cro.websiteUrl} target="_blank" rel="noopener" className="link text-sm">Website profile</a>}
          </div>
        </div>
      </div>

      <AskBox
        starters={CHAT_TOPICS.map((t) => ({ id: t.id, starter: t.starter }))}
        start={startChatAction}
        fixedCro={{ id: cro.id, name: cro.name }}
        lead={`You'll talk to ${first}'s AI CRO: an AI built from ${cro.name}'s documented expertise and judgment, not ${first} in person. It knows your company and the work under way.`}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {cro.bio && (
          <section className="surface p-5 space-y-2">
            <h2 className="text-lg font-semibold" style={fg}>About {first}</h2>
            <p className="text-base whitespace-pre-wrap" style={fg}>{cro.bio}</p>
            {cro.accomplishments && <p className="text-base whitespace-pre-wrap" style={muted}>{cro.accomplishments}</p>}
          </section>
        )}
        <section className="surface p-5 space-y-2" aria-label="Expertise">
          <h2 className="text-lg font-semibold" style={fg}>Expertise</h2>
          <dl className="text-base space-y-1">
            {[["Areas", cro.expertise], ["Industries", cro.industries], ["Stages", cro.stages], ["Functions", cro.functions]].map(([label, v]) =>
              (v as string[]).length ? (
                <div key={label as string} className="flex gap-2 flex-wrap">
                  <dt className="font-semibold" style={fg}>{label as string}:</dt>
                  <dd style={muted}>{(v as string[]).join(", ")}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {cro.availableForAdvisory && <p className="text-sm" style={{ color: "var(--green)" }}>Also available for advisory work in person: <Link href="/advisory/book" className="link">talk to Growth Goaled</Link>.</p>}
        </section>
      </div>

      {philosophy.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold" style={fg}>How {first} thinks</h2>
          <dl className="grid md:grid-cols-2 gap-4">
            {philosophy.map((p) => (
              <div key={p.label} className="surface p-4">
                <dt className="text-sm font-semibold" style={muted}>{p.label}</dt>
                <dd className="text-base mt-1 whitespace-pre-wrap" style={fg}>{p.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
