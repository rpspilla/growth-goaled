import { FREE_QUESTIONS } from "@/lib/guest/limits";
import { REVENUE_BANDS } from "@/lib/onboarding";
import type { LeadChat } from "@/lib/data/guest";

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const when = (d: Date | string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });

/** What the prospect told us in the chat, in the order it's asked. */
const FIELDS: [string, string][] = [
  ["challenge", "What they want help with"],
  ["name", "Name"],
  ["companyName", "Company"],
  ["revenueBand", "Revenue"],
  ["foundedYear", "Founded"],
  ["stage", "Funding stage"],
  ["vertical", "Vertical"],
  ["verticalOther", "Vertical (other)"],
  ["aes", "Account executives"],
  ["bdrs", "BDRs/SDRs"],
  ["cs", "Customer success"],
];
const shown = (key: string, v: string) => (key === "revenueBand" ? (REVENUE_BANDS.find((b) => b.value === v)?.label ?? v) : v || "skipped");

/** The free-question counts for a contact or company: lifetime against the cap, and per chat. */
export function QuestionCounts({ lifetime, sessions, mostInOneSession }: { lifetime: number; sessions: number; mostInOneSession: number }) {
  const atCap = lifetime >= FREE_QUESTIONS.perLifetime;
  return (
    <dl className="grid grid-cols-3 gap-3 text-sm" aria-label="Website chat questions">
      <div className="rounded-lg p-3" style={{ background: "var(--muted)" }}>
        <dt style={muted}>Questions asked</dt>
        <dd className="text-xl font-semibold tabular-nums" style={{ color: atCap ? "var(--amber)" : "var(--foreground)" }}>{lifetime} <span className="text-sm font-normal" style={muted}>of {FREE_QUESTIONS.perLifetime} free</span></dd>
      </div>
      <div className="rounded-lg p-3" style={{ background: "var(--muted)" }}>
        <dt style={muted}>Chats</dt>
        <dd className="text-xl font-semibold tabular-nums" style={fg}>{sessions}</dd>
      </div>
      <div className="rounded-lg p-3" style={{ background: "var(--muted)" }}>
        <dt style={muted}>Most in one chat</dt>
        <dd className="text-xl font-semibold tabular-nums" style={fg}>{mostInOneSession} <span className="text-sm font-normal" style={muted}>of {FREE_QUESTIONS.perSession}</span></dd>
      </div>
    </dl>
  );
}

/** Every website chat, oldest first: what they told us, then the whole conversation with times. */
export function LeadChats({ chats, names }: { chats: LeadChat[]; names?: Record<string, string> }) {
  if (!chats.length) return <p className="text-sm" style={muted}>No website chats yet. When a prospect chats on the sign-in page and gives this email, the conversation shows here.</p>;
  return (
    <ol className="space-y-5" aria-label="Website chats">
      {chats.map((c, n) => {
        const told = FIELDS.filter(([k]) => k in c.profile);
        return (
          <li key={c.id} className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="font-semibold" style={fg}>
                Chat {n + 1}
                {names && c.contactId && names[c.contactId] ? ` · ${names[c.contactId]}` : ""}
              </h3>
              <span className="text-xs" style={muted}>
                Started {when(c.startedAt)} · {c.questions} {c.questions === 1 ? "question" : "questions"}
                {c.claimed ? " · signed up" : ""}
              </span>
            </div>
            {told.length > 0 && (
              <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {told.map(([k, label]) => (
                  <div key={k} className={k === "challenge" ? "sm:col-span-2" : undefined}>
                    <dt className="inline" style={muted}>{label}: </dt>
                    <dd className="inline" style={fg}>{shown(k, c.profile[k] ?? "")}</dd>
                  </div>
                ))}
              </dl>
            )}
            <ol className="space-y-2 text-sm" aria-label={`Chat ${n + 1} messages`}>
              {c.messages.map((m, i) => (
                <li key={i} className="rounded-lg px-3 py-2" style={{ background: m.role === "user" ? "var(--blue-muted)" : "var(--muted)" }}>
                  <div className="text-xs mb-0.5" style={muted}>
                    {m.role === "user" ? "Prospect" : "Growth Goaled"}
                    {m.at ? ` · ${when(m.at)}` : ""}
                  </div>
                  <p className="whitespace-pre-wrap" style={fg}>{m.content}</p>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
