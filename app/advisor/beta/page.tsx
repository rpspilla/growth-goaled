import { requireRole } from "@/lib/auth/session";
import { BETA_QUESTIONS } from "@/lib/data/chat";
import { betaMetrics } from "@/lib/data/beta-metrics";

export const metadata = { title: "Rally Beta" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="surface p-4 space-y-1">
      <div className="text-sm" style={muted}>{label}</div>
      <div className="text-2xl font-semibold tabular-nums" style={fg}>{value}</div>
      {note && <div className="text-xs" style={muted}>{note}</div>}
    </div>
  );
}

/**
 * Rally Beta (Nov 24, 2026): are founders getting value quickly (activation), coming back (repeat
 * usage), and finding the advice useful (helpfulness)? Founders only.
 */
export default async function BetaPage() {
  await requireRole(["advisor", "admin"]);
  const m = await betaMetrics();
  const { activation: a, repeat: r, helpfulness: h } = m;
  return (
    <div className="page space-y-10">
      <header>
        <h1 className="font-display text-3xl" style={fg}>Rally Beta</h1>
        <p className="text-sm mt-1 max-w-3xl" style={muted}>Founders only. Activated: received a first answer and didn&apos;t rate only unhelpful. Returning: asked something on two or more days.</p>
      </header>

      <section aria-label="Activation" className="space-y-3">
        <h2 className="text-lg font-semibold" style={fg}>1. Activation</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Beta signups" value={a.signups} note={`${a.signupsThisWeek} in the last 7 days`} />
          <Stat label="Finished onboarding" value={a.onboarded} />
          <Stat label="Started a conversation" value={a.startedConversation} note={`${a.receivedAnswer} received an answer`} />
          <Stat label="Activated founders" value={a.activated} note={`${a.activatedPct}% of signups · median ${a.medianHoursToFirstAnswer ?? "—"} h to first answer`} />
        </div>
      </section>

      <section aria-label="Repeat usage" className="space-y-3">
        <h2 className="text-lg font-semibold" style={fg}>2. Repeat usage</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Active this week" value={r.weeklyActive} />
          <Stat label="Returning founders" value={r.returning} note={`${r.returningPct}% of those who started`} />
          <Stat label="Started a second conversation" value={`${r.secondConversationPct}%`} note={`${r.continuedPct}% came back to continue one`} />
          <Stat label="Conversations" value={r.conversations} note={`${r.perFounder} per founder · ${r.individual} with a CRO, ${r.collective} with the Collective`} />
        </div>
      </section>

      <section aria-label="Helpfulness" className="space-y-3">
        <h2 className="text-lg font-semibold" style={fg}>3. Helpfulness</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Answers rated helpful" value={`${h.helpfulPct}%`} note={`${h.helpful} helpful, ${h.notHelpful} not helpful`} />
          <Stat label="Came back after a helpful answer" value={`${h.cameBackAfterHelpful} of ${h.ratedHelpfulFounders}`} note="started another conversation later" />
          <Stat label="Feedback submitted" value={h.feedbackSubmitted} />
          <Stat label="Answers rated" value={h.rated} />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section aria-label="Most common questions" className="space-y-2">
          <h2 className="text-lg font-semibold" style={fg}>Most common questions</h2>
          <table className="surface w-full text-sm">
            <tbody>
              {m.topQuestions.map((q) => (
                <tr key={q.topic} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2" style={fg}>{q.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={muted}>{q.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {m.recentOwnQuestions.length > 0 && (
            <>
              <h3 className="text-sm font-semibold pt-2" style={fg}>Recent questions in founders&apos; own words</h3>
              <ul className="text-sm space-y-1" style={muted}>{m.recentOwnQuestions.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
        </section>
        <section aria-label="Why answers weren't helpful" className="space-y-2">
          <h2 className="text-lg font-semibold" style={fg}>Why answers weren&apos;t helpful</h2>
          {h.notHelpfulNotes.length ? (
            <ul className="surface divide-y text-sm" style={{ borderColor: "var(--border)" }}>
              {h.notHelpfulNotes.map((n, i) => <li key={i} className="px-3 py-2" style={{ ...fg, borderColor: "var(--border)" }}>{n.note}</li>)}
            </ul>
          ) : (
            <p className="surface p-3 text-sm" style={muted}>No reasons given yet.</p>
          )}
        </section>
      </div>

      <section aria-label="Founder feedback" className="space-y-2">
        <h2 className="text-lg font-semibold" style={fg}>Founder feedback</h2>
        {m.feedback.length ? (
          <ul className="space-y-3">
            {m.feedback.map((f, i) => (
              <li key={i} className="surface p-4 space-y-1.5 text-sm">
                <div style={muted}>{f.name || f.email} · {f.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{f.source === "after_helpful" ? " · after a helpful answer" : ""}</div>
                {(Object.keys(BETA_QUESTIONS) as (keyof typeof BETA_QUESTIONS)[]).map((k) =>
                  f.answers[k] ? (
                    <p key={k} style={fg}><span className="font-semibold">{BETA_QUESTIONS[k]}</span> {f.answers[k]}</p>
                  ) : null,
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface p-3 text-sm" style={muted}>No feedback yet.</p>
        )}
      </section>
    </div>
  );
}
