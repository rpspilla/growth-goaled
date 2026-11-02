import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Composer } from "@/components/chat/Composer";
import { RecommendationCardView } from "@/components/chat/RecommendationCardView";
import { getConversation } from "@/lib/data/chat";
import { founderContext } from "@/lib/data/founder-context";
import { getChatTopic } from "@/lib/chat/topics";
import { getUseCase } from "@/lib/use-cases";
import { formatPrice, pricing } from "@/lib/pricing";
import { feedbackAction, retryMessageAction, sendMessageAction } from "../actions";

// Each answer is prepared while the founder waits.
export const maxDuration = 300;

const fg = { color: "var(--foreground)" };

/** One conversation: the founder's messages, each answer, and the decision cards given along the way. */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const view = await getConversation(company, id.data);
  if (!view) notFound();
  const topic = getChatTopic(view.conversation.topic);
  const deep = topic?.deepAssessment ? getUseCase(topic.deepAssessment) : undefined;
  const deeper = deep && !deep.comingSoon ? { href: `/library/${deep.id}`, label: `Go deeper with your data: "${deep.question}" (${formatPrice(pricing().assessmentCents)}) →` } : null;
  const last = view.messages.at(-1);

  return (
    <div className="px-4 sm:px-8 py-8 max-w-3xl space-y-6">
      <div>
        <Link href="/chat" className="link text-sm">← All conversations</Link>
        <h1 className="font-display text-3xl font-normal mt-2" style={fg}>{view.conversation.title}</h1>
      </div>

      <ol className="space-y-5" aria-label="Conversation">
        {view.messages.map((m) => {
          const rec = m.recommendationId ? view.recommendations.get(m.recommendationId) : undefined;
          if (m.role === "user") {
            return (
              <li key={m.id} className="flex justify-end">
                <p className="rounded-2xl px-4 py-3 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>{m.content}</p>
              </li>
            );
          }
          return (
            <li key={m.id} className="space-y-4">
              <div className="text-base whitespace-pre-wrap leading-relaxed" style={fg}>{m.content}</div>
              {rec && (
                <RecommendationCardView
                  id={rec.id}
                  card={rec.card}
                  given={(view.feedback.get(rec.id) ?? []).map((f) => f.kind)}
                  deeper={deeper}
                  feedback={feedbackAction}
                />
              )}
            </li>
          );
        })}
      </ol>

      <Composer conversationId={view.conversation.id} send={sendMessageAction} retry={retryMessageAction} awaitingAnswer={last?.role === "user"} />
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Facts you mention are remembered for your company, so you won&apos;t be asked twice. <Link href="/chat#facts" className="link">See or correct them</Link>.
      </p>
    </div>
  );
}
