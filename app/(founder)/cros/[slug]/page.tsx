import Link from "next/link";
import { askVoice } from "@/lib/data/voice";
import { isBeta } from "@/lib/beta";
import { notFound, redirect } from "next/navigation";
import { AskBox } from "@/components/chat/AskBox";
import { CHAT_TOPICS } from "@/lib/chat/topics";
import { PHILOSOPHY_FIELDS, topicsFor } from "@/lib/cro";
import { listConversations } from "@/lib/data/chat";
import { founderContext } from "@/lib/data/founder-context";
import { publishedCro } from "@/lib/data/cro";
import { setDefaultCroAction, startChatAction } from "../../chat/actions";
import { DefaultCroButton } from "@/components/chat/Perspective";

export const metadata = { title: "CRO" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

/** One CRO, as founders see them: who they are, what they know, how they think, and their AI to ask. */
export default async function CroPage({ params }: { params: Promise<{ slug: string }> }) {
  const { user, company } = await founderContext();
  const voice = await askVoice(user);
  if (!company) redirect("/welcome");
  const { slug } = await params;
  const cro = await publishedCro(slug);
  if (!cro) notFound();
  const first = cro.name.split(" ")[0];
  // Example questions: the topics this CRO is strongest on; and the founder's conversations with them.
  const strong = topicsFor(cro.expertise, CHAT_TOPICS.map((t) => t.id));
  const starters = strong.map((id) => CHAT_TOPICS.find((t) => t.id === id)!).map((t) => ({ id: t.id, starter: t.starter }));
  const mine = await listConversations(company, 10, { cro: cro.id });
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
            <div className="flex items-center gap-4 flex-wrap">
              {cro.linkedinUrl && <a href={cro.linkedinUrl} target="_blank" rel="noopener" className="link text-sm">Career history on LinkedIn</a>}
              <DefaultCroButton croId={cro.id} isDefault={company.defaultCroId === cro.id} label={`${cro.name}'s AI CRO`} set={setDefaultCroAction} />
            </div>
          </div>
        </div>
      </div>

      <AskBox voice={voice}
        starters={[...starters, { id: "other", starter: "" }]}
        startersLabel={`Questions ${first} can help with`}
        start={startChatAction}
        fixedCro={{ id: cro.id, name: cro.name }}
        lead={`An AI built on ${first}'s documented expertise and judgment, not ${first} in person. It knows your company and picks up where you left off.`}
      />

      {mine.length > 0 && (
        <section aria-label={`Your conversations with ${first}`} className="space-y-2">
          <h2 className="text-lg font-semibold" style={fg}>Your conversations with {first}</h2>
          <ul className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {mine.map((c) => (
              <li key={c.id} style={{ borderColor: "var(--border)" }}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--muted)] rounded-xl">
                  <span className="flex-1 min-w-0 truncate text-base" style={fg}>{c.title}</span>
                  <span className="text-sm" style={muted}>{c.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          {cro.availableForAdvisory && !isBeta() && <p className="text-sm" style={{ color: "var(--green)" }}>Also available for advisory work in person: <Link href="/advisory/book" className="link">talk to Growth Goaled</Link>.</p>}
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
