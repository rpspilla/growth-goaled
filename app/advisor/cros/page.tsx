import Link from "next/link";
import { ActionForm } from "@/components/advisor/ActionForm";
import { requireRole } from "@/lib/auth/session";
import { listCroProfiles, listIntelligence } from "@/lib/data/cro";
import { createCroAction } from "./actions";

export const metadata = { title: "CRO network" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

/**
 * The CRO network (Nov 23, 2026): every CRO's profile, whether founders can talk to their AI
 * representation (published) and whether they're part of the Growth Goaled Collective.
 */
export default async function CrosPage() {
  const user = await requireRole(["advisor", "admin"]);
  const [cros, records] = await Promise.all([listCroProfiles(), listIntelligence()]);
  const count = (id: string) => records.filter((r) => r.primaryCroId === id || r.stances.some((s) => s.croId === id && s.stance === "co_author"));
  return (
    <div className="page space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl" style={fg}>CRO network</h1>
          <p className="text-sm mt-1 max-w-3xl" style={muted}>
            Each CRO has their own profile and intelligence. Founders can talk to a published CRO&apos;s AI representation, or to the Growth Goaled Collective, which draws on every CRO in it.
          </p>
        </div>
        <Link href="/advisor/intelligence" className="link text-sm">Intelligence library →</Link>
      </header>

      {cros.length ? (
        <ul aria-label="CROs" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
          {cros.map((c) => {
            const mine = count(c.id);
            return (
              <li key={c.id} className="p-4 flex items-center gap-4 flex-wrap" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1 min-w-[14rem]">
                  <Link href={`/advisor/cros/${c.id}`} className="text-base font-semibold hover:underline" style={fg}>{c.name}</Link>
                  {c.headline && <div className="text-sm" style={muted}>{c.headline}</div>}
                  {c.expertise.length > 0 && <div className="text-xs mt-1" style={muted}>{c.expertise.slice(0, 6).join(" · ")}</div>}
                </div>
                <span className="text-sm" style={muted}>{mine.filter((r) => r.status === "validated").length} validated · {mine.length} records</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={c.status === "published" ? { background: "var(--green-muted)", color: "var(--green)" } : { background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  {c.status === "published" ? "Published" : "Draft"}
                </span>
                <span className="text-xs" style={muted}>{c.inCollective ? "In the Collective" : "Not in the Collective"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="surface p-5 text-base" style={muted}>No CROs yet.{user.role === "admin" ? " Add the first one below." : " An admin adds CRO profiles."}</p>
      )}

      {user.role === "admin" && (
        <section className="surface p-5 space-y-3">
          <h2 className="text-lg font-semibold" style={fg}>Add a CRO</h2>
          <p className="text-sm" style={muted}>Starts as a draft: fill in their profile in their own words, link their login so they can contribute, then publish.</p>
          <ActionForm action={createCroAction} submit="Add CRO" label="Add a CRO" className="flex gap-2 items-end flex-wrap">
            <input name="name" required maxLength={120} placeholder="Full name" aria-label="Name" className="field" />
            <input name="headline" maxLength={200} placeholder="Headline, e.g. Former CRO, three Series A SaaS companies" aria-label="Headline" className="field flex-1 min-w-[18rem]" />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
