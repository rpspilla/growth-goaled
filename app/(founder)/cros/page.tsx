import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";
import { listCroProfiles } from "@/lib/data/cro";

export const metadata = { title: "Our CROs" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

/**
 * The CRO directory (Nov 23, 2026): the CROs in the Growth Goaled network whose AI representation a
 * founder can talk to, and the Collective, which draws on all of them.
 */
export default async function CroDirectoryPage() {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const cros = await listCroProfiles({ published: true });
  return (
    <div className="page space-y-8">
      <PageHeader title="Our CROs" subtitle="Talk to one CRO's AI, built from their own documented expertise and judgment, or to the Growth Goaled Collective, which draws on all of them." />

      <section aria-label="The Growth Goaled Collective" className="surface p-5 space-y-2">
        <h2 className="text-xl font-semibold" style={fg}>The Growth Goaled Collective</h2>
        <p className="text-base" style={muted}>
          One recommendation that draws on the most relevant experience across our CROs. Where they see it differently, you&apos;ll hear why, and which view fits your company.
        </p>
        <Link href="/whats-next" className="btn btn-primary inline-block">Ask the Collective</Link>
      </section>

      {cros.length ? (
        <ul aria-label="CROs" className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cros.map((c) => (
            <li key={c.id} className="surface p-5 space-y-2 flex flex-col">
              <div className="flex items-center gap-3">
                {c.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <span className="w-12 h-12 rounded-full flex items-center justify-center font-semibold" style={{ background: "var(--muted)", ...fg }} aria-hidden>
                    {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold" style={fg}>{c.name}</h3>
                  {c.headline && <p className="text-sm" style={muted}>{c.headline}</p>}
                </div>
              </div>
              {c.expertise.length > 0 && <p className="text-sm" style={muted}>{c.expertise.slice(0, 6).join(" · ")}</p>}
              <div className="flex-1" />
              <Link href={`/cros/${c.slug}`} className="link">Profile and ask {c.name.split(" ")[0]}&apos;s AI →</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="surface p-5 text-base" style={muted}>Our CROs&apos; profiles are on their way. Meanwhile, the Collective answers every question.</p>
      )}
    </div>
  );
}
