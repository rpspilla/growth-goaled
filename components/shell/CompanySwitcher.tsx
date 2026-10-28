import Link from "next/link";
import { switchCompany } from "@/app/(founder)/companies/actions";

/**
 * The company name in the founder top bar; with several companies (or the right to add one), a
 * menu to switch between them and to add another. A plain form, so it works without scripts.
 */
export function CompanySwitcher({ current, companies, canAdd }: { current: { id: string; name: string } | null; companies: { id: string; name: string }[]; canAdd: boolean }) {
  const name = current?.name ?? "Your company";
  const badge = (
    <div className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center shrink-0" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
      {name[0]?.toUpperCase()}
    </div>
  );
  if (companies.length < 2 && !canAdd) {
    return (
      <>
        {badge}
        <span className="font-semibold text-base truncate" style={{ color: "var(--foreground)" }}>{name}</span>
      </>
    );
  }
  return (
    <details className="relative">
      <summary className="flex items-center gap-2 cursor-pointer list-none rounded-lg px-2 py-1 -mx-2 hover:bg-[var(--muted)]" aria-label={`Company: ${name}. Switch company`}>
        {badge}
        <span className="font-semibold text-base truncate max-w-[40vw]" style={{ color: "var(--foreground)" }}>{name}</span>
        <span aria-hidden className="text-sm" style={{ color: "var(--muted-foreground)" }}>▾</span>
      </summary>
      <div className="absolute left-0 top-full mt-2 z-50 w-72 surface p-2 shadow-lg">
        <div className="label px-2 pt-1 pb-2">Your companies</div>
        <ul>
          {companies.map((c) => (
            <li key={c.id}>
              <form action={switchCompany}>
                <input type="hidden" name="companyId" value={c.id} />
                <button type="submit" className="w-full text-left px-2 py-2 rounded-lg text-base hover:bg-[var(--muted)] flex items-center gap-2" aria-current={c.id === current?.id ? "true" : undefined} style={{ color: "var(--foreground)" }}>
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.id === current?.id && <span aria-hidden style={{ color: "var(--green)" }}>✓</span>}
                </button>
              </form>
            </li>
          ))}
        </ul>
        {canAdd && (
          <Link href="/companies/new" className="block mt-1 pt-2 px-2 py-2 border-t link text-base" style={{ borderColor: "var(--border)" }}>
            + Add a company
          </Link>
        )}
      </div>
    </details>
  );
}
