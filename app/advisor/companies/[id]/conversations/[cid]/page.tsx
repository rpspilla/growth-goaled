import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/advisor/ActionForm";
import { RecommendationCardView } from "@/components/chat/RecommendationCardView";
import { CommitmentList } from "@/components/projects/CommitmentList";
import { commitmentItems } from "@/lib/commitments";
import { getConversation } from "@/lib/data/chat";
import { companyCommitments } from "@/lib/data/commitments";
import { attributionFor, getCroProfile } from "@/lib/data/cro";
import { companyProjects, today } from "@/lib/data/projects";
import { companyContext } from "../../context";
import { advisorNoteAction, correctionAction } from "../../actions";

export const metadata = { title: "Conversation" };

const fg = { color: "var(--foreground)" };
const muted = { color: "var(--muted-foreground)" };

/**
 * One of the founder's conversations with their AI CRO, for their advisor (Nov 24, 2026): every
 * message and decision card, what it was committed to, and a note from the advisor, which the AI
 * follows from then on and the founder is emailed about.
 */
export default async function AdvisorConversationPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  const { company } = await companyContext(id);
  if (!/^[0-9a-f-]{36}$/.test(cid)) notFound();
  const view = await getConversation(company, cid);
  if (!view) notFound();
  const [cro, projects, commitments] = await Promise.all([
    view.conversation.croId ? getCroProfile(view.conversation.croId) : Promise.resolve(null),
    companyProjects(company),
    companyCommitments(company).then((all) => all.filter((c) => c.conversationId === view.conversation.id)),
  ]);
  const sources = await attributionFor([...view.recommendations.values()].flatMap((r) => (r.card.sources ?? []).map((x) => x.id)));
  const informedBy = (card: { sources?: { id: string; how: string }[] }) =>
    (card.sources ?? []).flatMap((x) => {
      const a = sources.get(x.id);
      return a ? [{ title: a.title, cro: a.cro ?? "Growth Goaled network", how: x.how }] : [];
    });
  const names = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="page space-y-6 max-w-5xl">
      <div>
        <Link href={`/advisor/companies/${company.id}#whats-next`} className="link text-sm">← {company.name}: conversations</Link>
        <h1 className="font-display text-3xl mt-2" style={fg}>{view.conversation.title}</h1>
        <p className="text-sm mt-1" style={muted}>
          {cro ? `With ${cro.name}'s AI CRO` : "With the Growth Goaled Collective"} · started {view.conversation.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      <ol aria-label="Conversation" className="space-y-4">
        {view.messages.map((m) => {
          const rec = m.recommendationId ? view.recommendations.get(m.recommendationId) : undefined;
          return (
            <li key={m.id} className="space-y-3">
              <div className="rounded-xl px-4 py-3" style={{ background: m.role === "user" ? "var(--muted)" : m.role === "advisor" ? "var(--green-muted)" : "transparent", border: m.role === "assistant" ? "1px solid var(--border)" : undefined }}>
                <div className="text-sm font-semibold mb-1" style={{ color: m.role === "advisor" ? "var(--green)" : "var(--muted-foreground)" }}>
                  {m.role === "user" ? "Founder" : m.role === "advisor" ? `Advisor${m.authorId && view.authors.get(m.authorId) ? ` · ${view.authors.get(m.authorId)}` : ""}` : cro ? `${cro.name}'s AI CRO` : "AI CRO"}
                </div>
                <div className="text-base whitespace-pre-wrap" style={fg}>{m.content}</div>
                {m.role === "assistant" && (
                  <details className="mt-2">
                    <summary className="text-sm link cursor-pointer">Correct this answer</summary>
                    <ActionForm action={correctionAction.bind(null, company.id, m.id)} submit="Save correction" label="Correct this answer" resetOnSuccess className="space-y-2 mt-2">
                      <textarea name="wrong" rows={2} maxLength={2000} required aria-label="What was wrong" placeholder="What was wrong" className="field w-full" />
                      <textarea name="right" rows={3} maxLength={4000} required aria-label="The right guidance" placeholder="The right guidance, as you'd give it" className="field w-full" />
                      <p className="text-xs" style={muted}>Becomes a Correction record, attributed to you and submitted for review. Once validated, the AI follows it on this topic.</p>
                    </ActionForm>
                  </details>
                )}
              </div>
              {rec && <RecommendationCardView id={rec.id} card={rec.card} given={(view.feedback.get(rec.id) ?? []).map((f) => f.kind)} deeper={null} compact informedBy={informedBy(rec.card)} />}
            </li>
          );
        })}
      </ol>

      {commitments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold" style={fg}>Committed from this conversation</h2>
          <CommitmentList items={commitmentItems(commitments, names, today())} label="Committed from this conversation" />
        </section>
      )}

      <section className="surface p-5 space-y-3">
        <h2 className="text-lg font-semibold" style={fg}>Add a note</h2>
        <p className="text-sm" style={muted}>The founder sees it in the conversation and gets an email. The AI CRO follows your direction from here on.</p>
        <ActionForm action={advisorNoteAction.bind(null, company.id, view.conversation.id)} submit="Post note" label="Advisor note" resetOnSuccess>
          <textarea name="note" rows={4} maxLength={4000} required aria-label="Note" className="field w-full" placeholder="e.g. Before hiring, let's look at your last 20 closed deals together. I'll set up time this week." />
        </ActionForm>
      </section>
    </div>
  );
}
