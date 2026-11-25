import Link from "next/link";
import { listCroProfiles } from "@/lib/data/cro";

export const metadata = { title: "Our CROs · Growth Goaled", description: "Talk to the AI of an experienced CRO, or to the combined expertise of the Growth Goaled CRO network." };
export const dynamic = "force-dynamic";

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

/** The public CRO directory: the Collective first, then every published CRO, each with their AI to talk to. */
export default async function NetworkPage() {
  const cros = await listCroProfiles({ published: true });
  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <h1 className="font-display text-4xl sm:text-5xl leading-tight" style={fg}>The CROs behind Growth Goaled</h1>
        <p className="text-lg mt-3" style={muted}>
          Talk to one CRO&apos;s AI, built from their own documented expertise and judgment, or to the Rally Collective, which brings the network&apos;s expertise to your question. It&apos;s free to start.
        </p>
      </header>

      <section aria-label="The Rally Collective" className="surface p-6 space-y-2" style={{ borderColor: "var(--green)" }}>
        <h2 className="text-2xl font-semibold" style={fg}>The Rally Collective</h2>
        <p className="text-base max-w-3xl" style={muted}>One recommendation that draws on the most relevant experience across our CROs. Where they see it differently, you&apos;ll hear why, and which view fits your company.</p>
        <Link href="/sign-in" className="btn btn-primary inline-block">Talk to the Collective</Link>
      </section>

      {cros.length > 0 && (
        <ul aria-label="CROs" className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {cros.map((c) => (
            <li key={c.id} className="surface p-6 space-y-3 flex flex-col">
              <div className="flex items-center gap-3">
                {c.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <span className="w-14 h-14 rounded-full flex items-center justify-center font-semibold" style={{ background: "var(--muted)", ...fg }} aria-hidden>
                    {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold" style={fg}>{c.name}</h2>
                  {c.headline && <p className="text-sm" style={muted}>{c.headline}</p>}
                </div>
              </div>
              {c.expertise.length > 0 && <p className="text-sm" style={muted}>{c.expertise.slice(0, 6).join(" · ")}</p>}
              {(c.stages.length > 0 || c.industries.length > 0) && <p className="text-sm" style={muted}>{[c.stages.join(", "), c.industries.join(", ")].filter(Boolean).join(" · ")}</p>}
              <div className="flex-1" />
              <Link href={`/network/${c.slug}`} className="link">Meet {c.name.split(" ")[0]} →</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
