import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";
import { listDecisions } from "@/lib/data/decisions";
import { listCroProfiles } from "@/lib/data/cro";

export const metadata = { title: "Decisions · Rally" };

const fg = { color: "var(--foreground)" };
const muted = { color: "var(--muted-foreground)" };

/**
 * Decisions (Nov 25, 2026): every recommendation the founder saved for later or committed to, with
 * who gave it, the conversation it came from and, once committed, the growth project that tracks it.
 */
export default async function DecisionsPage() {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const [decisions, cros] = await Promise.all([listDecisions(company), listCroProfiles()]);
  const croName = new Map(cros.map((c) => [c.id, c.name]));
  return (
    <div className="page max-w-3xl mx-auto space-y-6">
      <PageHeader title="Decisions" subtitle="Recommendations you saved or committed to. Conversations are always kept; find them on the Rally home screen." />
      {decisions.length === 0 ? (
        <div className="surface p-6 space-y-2">
          <p className="text-base" style={fg}>Nothing saved yet.</p>
          <p className="text-sm" style={muted}>
            When Rally gives you a recommendation, choose <strong>Save recommendation</strong> to keep it here, or <strong>Commit to this</strong> to turn its next steps into tasks Rally follows up on.
          </p>
          <Link href="/whats-next" className="btn btn-primary inline-block mt-2">Ask Rally</Link>
        </div>
      ) : (
        <ul aria-label="Decisions" className="space-y-3">
          {decisions.map((d) => (
            <li key={d.id} className="surface p-5 space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="rounded-full px-2 py-0.5 font-semibold" style={d.status === "committed" ? { background: "var(--green)", color: "#fff" } : { background: "var(--muted)", color: "var(--foreground)" }}>
                  {d.status === "committed" ? "Committed" : "Saved"}
                </span>
                <span style={muted}>
                  {d.croId ? (croName.get(d.croId) ?? "A CRO") : "Rally Collective"} · {d.at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <h2 className="text-lg font-semibold" style={fg}>{d.takeaway}</h2>
              <p className="text-sm" style={muted}>Asked: {d.question}</p>
              <div className="flex items-center gap-4 flex-wrap text-sm pt-1">
                {d.conversationId && <Link href={`/chat/${d.conversationId}`} className="link">Open the conversation</Link>}
                {d.status === "committed" && <Link href={d.projectId ? `/projects/${d.projectId}` : "/projects"} className="link">Track progress</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
