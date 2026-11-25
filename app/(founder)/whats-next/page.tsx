import Link from "next/link";
import { redirect } from "next/navigation";
import { FactsEditor } from "@/components/chat/FactsEditor";
import { RallyEntry } from "@/components/chat/RallyEntry";
import { toCroCard } from "@/components/chat/CroIdentity";
import { listConversations, listFacts } from "@/lib/data/chat";
import { companyCommitments } from "@/lib/data/commitments";
import { listCroProfiles } from "@/lib/data/cro";
import { founderContext } from "@/lib/data/founder-context";
import { suggestionsFor } from "@/lib/chat/suggestions";
import { voiceConfigured } from "@/lib/ai/voice";
import { rallyVoice } from "@/lib/data/voice";
import { removeFactAction, startChatAction, updateFactAction } from "../chat/actions";

export const maxDuration = 300;

export const metadata = { title: "Rally" };

const RECENT_DAYS = 7;
const isRecent = (d: Date) => Date.now() - d.getTime() < RECENT_DAYS * 86_400_000;

/**
 * Rally (Rally Beta, Nov 24, 2026; was "Ask your CRO" and "What's Next?"): who the founder is talking
 * to, four suggested questions for their stage, their own question, and "Continue" for a conversation
 * from the last week. All conversations and what Rally remembers sit below.
 */
export default async function RallyPage({ searchParams }: { searchParams: Promise<{ ask?: string; with?: string; show?: string }> }) {
  const { user, company } = await founderContext();
  if (!company) redirect("/welcome");
  const [conversations, facts, cros, open, rally] = await Promise.all([listConversations(company, 50), listFacts(company), listCroProfiles({ published: true }), companyCommitments(company, { status: ["open"] }), rallyVoice()]);
  const { ask, with: withCro, show } = await searchParams;
  // The conversation list, narrowed to the Collective's or one CRO's (?show=collective | a CRO's slug).
  const showCro = show === "collective" ? null : cros.find((c) => c.slug === show)?.id;
  const shown = showCro === undefined ? conversations : await listConversations(company, 50, { cro: showCro });
  const croName = new Map(cros.map((c) => [c.id, c.name]));
  const askedOf = new Set(conversations.map((c) => c.croId));
  const filters = [{ key: "", label: "All" }, ...(askedOf.has(null) ? [{ key: "collective", label: "Rally Collective" }] : []), ...cros.filter((c) => askedOf.has(c.id)).map((c) => ({ key: c.slug, label: c.name }))];
  const current = showCro === undefined ? "" : (show ?? "");
  const latest = conversations[0];
  const continueWith = latest && isRecent(latest.updatedAt) ? { id: latest.id, title: latest.title } : null;
  return (
    <div className="page max-w-3xl mx-auto space-y-14">
      <RallyEntry
        start={startChatAction}
        cros={cros.map(toCroCard)}
        collective={cros.filter((c) => c.inCollective).map(toCroCard)}
        defaultCroId={withCro === "collective" ? null : cros.find((c) => c.slug === withCro)?.id ?? company.defaultCroId}
        initialQuestion={ask?.slice(0, 2000) ?? ""}
        suggestions={suggestionsFor({ stage: company.stage, openCommitments: open.length })}
        firstName={user.name?.trim().split(/\s+/)[0] || null}
        companyName={company.name}
        continueWith={continueWith}
        voice={{ transcribe: voiceConfigured(), voiced: Boolean(rally) }}
      />

      <section id="facts" aria-labelledby="history-title" className="scroll-mt-24 space-y-4">
        <h2 id="history-title" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Your conversations</h2>
        {filters.length > 2 && (
          <nav aria-label="Show conversations with" className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Link
                key={f.key}
                href={f.key ? `/whats-next?show=${f.key}#facts` : "/whats-next#facts"}
                aria-current={f.key === current ? "true" : undefined}
                className="text-sm rounded-full px-3 py-1 border"
                style={f.key === current ? { background: "var(--green)", color: "#fff", borderColor: "var(--green)" } : { borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        )}
        {shown.length > 0 ? (
          <ul aria-label="Questions asked" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {shown.map((c) => (
              <li key={c.id} style={{ borderColor: "var(--border)" }}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--muted)] rounded-xl">
                  <span className="flex-1 min-w-0">
                    <span className="block text-base truncate" style={{ color: "var(--foreground)" }}>{c.title}</span>
                    <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>{c.croId ? (croName.get(c.croId) ?? "A CRO") : "Rally Collective"}</span>
                  </span>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{c.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Your conversations will appear here.</p>
        )}
        <details className="surface px-4 py-3">
          <summary className="cursor-pointer text-base font-semibold" style={{ color: "var(--foreground)" }}>What Rally remembers about {company.name}</summary>
          <p className="text-sm mt-2 mb-3" style={{ color: "var(--muted-foreground)" }}>Correct anything that&apos;s wrong; corrected facts are marked confirmed and won&apos;t be overwritten.</p>
          <FactsEditor facts={facts.map((f) => ({ id: f.id, label: f.label, value: f.value, status: f.status }))} update={updateFactAction} remove={removeFactAction} />
        </details>
      </section>
    </div>
  );
}
