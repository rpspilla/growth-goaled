import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";
import { listCroProfiles } from "@/lib/data/cro";
import { DefaultCroButton } from "@/components/chat/Perspective";
import { setDefaultCroAction } from "../chat/actions";

export const metadata = { title: "Our CROs" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

/**
 * The CRO directory (Nov 23, 2026): the CROs in the Rally Collective whose AI representation a
 * founder can talk to, and the Collective, which draws on all of them.
 */
export default async function CroDirectoryPage() {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const cros = await listCroProfiles({ published: true });
  return (
    <div className="page space-y-8">
      <PageHeader title="Meet your CRO collective" subtitle="Experienced operators. Different perspectives. Ask them all at once, or one at a time. Each is an AI built on that CRO's documented expertise." />

      <section aria-label="The Rally Collective Brain" className="surface p-5 space-y-2">
        <h2 className="text-xl font-semibold" style={fg}>The Rally Collective Brain <span className="text-base font-normal" style={muted}>· all our CROs</span></h2>
        <p className="text-base" style={muted}>
          One recommendation that draws on the most relevant experience across our CROs. Where they see it differently, you&apos;ll hear why, and which view fits your company.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/whats-next?with=collective" className="btn btn-primary inline-block">Ask the Collective</Link>
          <DefaultCroButton croId={null} isDefault={!company.defaultCroId || !cros.some((c) => c.id === company.defaultCroId)} label="the Collective" set={setDefaultCroAction} />
        </div>
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
              <div className="flex items-center gap-4 flex-wrap">
                <Link href={`/whats-next?with=${c.slug}`} className="btn btn-primary text-sm py-1.5">Ask {c.name.split(" ")[0]}</Link>
                <Link href={`/cros/${c.slug}`} className="link text-sm">View profile</Link>
                <DefaultCroButton croId={c.id} isDefault={company.defaultCroId === c.id} label={`${c.name}'s CRO-Brain`} set={setDefaultCroAction} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="surface p-5 text-base" style={muted}>Our CROs&apos; profiles are on their way. Meanwhile, the Collective answers every question.</p>
      )}
    </div>
  );
}
