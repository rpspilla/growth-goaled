import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { qualityReport, type QualityRow } from "@/lib/data/quality";

export const metadata = { title: "AI CRO quality" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

function Table({ label, first, rows }: { label: string; first: string; rows: QualityRow[] }) {
  if (!rows.length) return <p className="surface p-4 text-sm" style={muted}>Nothing yet.</p>;
  return (
    <div className="surface overflow-x-auto">
      <table aria-label={label} className="w-full text-sm">
        <thead>
          <tr className="text-left" style={muted}>
            {[first, "Conversations", "Recommendations", "Committed", "Rated helpful", "Pushed back", "Worked", "Partly", "Didn't"].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2 font-medium" style={fg}>{r.label}</td>
              <td className="px-3 py-2 font-mono">{r.conversations}</td>
              <td className="px-3 py-2 font-mono">{r.recommendations}</td>
              <td className="px-3 py-2 font-mono">{r.committed} <span style={muted}>({pct(r.committed, r.recommendations)})</span></td>
              <td className="px-3 py-2 font-mono">{r.helpful}</td>
              <td className="px-3 py-2 font-mono" style={r.pushback ? { color: "var(--amber)" } : undefined}>{r.pushback}</td>
              <td className="px-3 py-2 font-mono" style={{ color: "var(--green)" }}>{r.worked}</td>
              <td className="px-3 py-2 font-mono">{r.partly}</td>
              <td className="px-3 py-2 font-mono" style={r.didnt ? { color: "var(--red)" } : undefined}>{r.didnt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The AI CRO's track record (Nov 24, 2026): by question, by CRO and by intelligence record, from what
 * founders did with the advice: committed to it, rated it, and how the commitments went.
 */
export default async function QualityPage() {
  await requireRole(["advisor", "admin"]);
  const { topics, cros, records } = await qualityReport();
  return (
    <div className="page space-y-8">
      <header>
        <h1 className="font-display text-3xl" style={fg}>AI CRO quality</h1>
        <p className="text-sm mt-1 max-w-3xl" style={muted}>
          What founders did with the advice: how often a recommendation became commitments, how they rated it, and how the commitments went. Pushed back means rated incorrect, incomplete, not relevant or disagree. Sample companies are left out.
        </p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold" style={fg}>By question</h2>
        <Table label="By question" first="Question" rows={topics} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold" style={fg}>By CRO</h2>
        <Table label="By CRO" first="Who answered" rows={cros} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold" style={fg}>Intelligence records in use</h2>
        {records.length ? (
          <div className="surface overflow-x-auto">
            <table aria-label="Intelligence records in use" className="w-full text-sm">
              <thead>
                <tr className="text-left" style={muted}>
                  {["Record", "CRO", "Answers that used it", "Worked", "Partly", "Didn't"].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2"><Link href={`/advisor/intelligence/${r.id}`} className="link">{r.title}</Link></td>
                    <td className="px-3 py-2" style={muted}>{r.cro}</td>
                    <td className="px-3 py-2 font-mono">{r.uses}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--green)" }}>{r.worked}</td>
                    <td className="px-3 py-2 font-mono">{r.partly}</td>
                    <td className="px-3 py-2 font-mono" style={r.didnt ? { color: "var(--red)" } : undefined}>{r.didnt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="surface p-4 text-sm" style={muted}>No answer has drawn on a record yet.</p>
        )}
      </section>
    </div>
  );
}
