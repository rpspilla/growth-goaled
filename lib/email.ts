import "server-only";

type SendResult = { sent: true } | { sent: false; reason: string };

/**
 * Sends an email through Resend's HTTP API. Without RESEND_API_KEY nothing is
 * sent and callers fall back to showing the link to the advisor.
 */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email isn't configured yet (RESEND_API_KEY)." };
  const from = process.env.EMAIL_FROM ?? "Growth Goaled <invites@growthgoaled.com>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text().catch(() => ""));
      return { sent: false, reason: `Email provider returned ${res.status}.` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] Resend request failed", err);
    return { sent: false, reason: "Couldn't reach the email provider." };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function inviteEmail(p: { advisorName: string; companyName: string; link: string; expiresInDays: number }) {
  const subject = `${p.advisorName} invited you to Growth Goaled`;
  const text = `${p.advisorName} has set up ${p.companyName} on Growth Goaled.

Accept your invite: ${p.link}

The link works once and expires in ${p.expiresInDays} days.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:480px">
<p style="font-size:15px">${escape(p.advisorName)} has set up <strong>${escape(p.companyName)}</strong> on Growth Goaled.</p>
<p><a href="${escape(p.link)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Accept your invite</a></p>
<p style="font-size:12px;color:#64748B">The link works once and expires in ${p.expiresInDays} days.<br>Know where you stand. Know what to fix. Know what comes next.</p>
</div>`;
  return { subject, text, html };
}
