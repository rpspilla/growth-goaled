import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ChatStart } from "@/components/chat/ChatStart";
import { FactsEditor } from "@/components/chat/FactsEditor";
import { Section } from "@/components/ui/Section";
import { listConversations, listFacts } from "@/lib/data/chat";
import { founderContext } from "@/lib/data/founder-context";
import { CHAT_TOPICS } from "@/lib/chat/topics";
import { removeFactAction, startChatAction, updateFactAction } from "./actions";

export const maxDuration = 300;

/** All conversations, a new one, and what Growth Goaled remembers about the company. */
export default async function ChatIndexPage() {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const [conversations, facts] = await Promise.all([listConversations(company, 50), listFacts(company)]);
  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl space-y-12">
      <PageHeader eyebrow={company.name} title="Conversations" subtitle="Ask about any commercial decision. Answers use what you've already shared." />

      {conversations.length > 0 && (
        <Section id="recent" title="Your conversations">
          <ul className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {conversations.map((c) => (
              <li key={c.id} style={{ borderColor: "var(--border)" }}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-[var(--muted)] rounded-xl">
                  <span className="flex-1 min-w-0 text-base font-semibold" style={{ color: "var(--foreground)" }}>{c.title}</span>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{c.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span aria-hidden style={{ color: "var(--muted-foreground)" }}>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="new" title="Start a new conversation">
        <ChatStart starters={CHAT_TOPICS.map((t) => ({ id: t.id, starter: t.starter }))} start={startChatAction} heading={false} />
      </Section>

      <div id="facts" className="scroll-mt-24">
        <Section id="facts-title" title="What we remember about your company" lead="From your conversations. Correct anything that's wrong; corrected facts are marked confirmed and won't be overwritten.">
          <FactsEditor facts={facts.map((f) => ({ id: f.id, label: f.label, value: f.value, status: f.status }))} update={updateFactAction} remove={removeFactAction} />
        </Section>
      </div>
    </div>
  );
}
