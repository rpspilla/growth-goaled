import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ChatStart } from "@/components/chat/ChatStart";
import { FactsEditor } from "@/components/chat/FactsEditor";
import { Section } from "@/components/ui/Section";
import { listConversations, listFacts } from "@/lib/data/chat";
import { founderContext } from "@/lib/data/founder-context";
import { CHAT_TOPICS } from "@/lib/chat/topics";
import { removeFactAction, startChatAction, updateFactAction } from "../chat/actions";

export const maxDuration = 300;

export const metadata = { title: "What's Next?" };

/**
 * What's Next? (was "Strategic Growth Questions", at /chat): the next question to ask, and History
 * (the questions asked so far, and what Growth Goaled remembers about the company). Starting a growth
 * project lives on Growth Projects.
 */
export default async function WhatsNextPage() {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const [conversations, facts] = await Promise.all([listConversations(company, 50), listFacts(company)]);
  return (
    <div className="page space-y-12">
      <PageHeader title="What's Next?" subtitle="Ask about any commercial decision. Answers use what you've already shared." />

      <Section id="new" title="What strategic growth question is next?">
        <ChatStart starters={CHAT_TOPICS.map((t) => ({ id: t.id, starter: t.starter }))} start={startChatAction} heading={false} />
      </Section>

      <div id="facts" className="scroll-mt-24">
        <Section id="facts-title" title="History" lead="The questions you've asked, and what we remember about your company from them.">
          {conversations.length > 0 && (
            <ul aria-label="Questions asked" className="surface divide-y mb-6" style={{ borderColor: "var(--border)" }}>
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
          )}
          <h3 className="text-base font-semibold mb-1" style={{ color: "var(--foreground)" }}>What we remember</h3>
          <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>Correct anything that&apos;s wrong; corrected facts are marked confirmed and won&apos;t be overwritten.</p>
          <FactsEditor facts={facts.map((f) => ({ id: f.id, label: f.label, value: f.value, status: f.status }))} update={updateFactAction} remove={removeFactAction} />
        </Section>
      </div>
    </div>
  );
}
