import "server-only";

type SendResult = { sent: true } | { sent: false; reason: string };

/**
 * Sends an email through Resend's HTTP API. Without RESEND_API_KEY nothing is
 * sent and callers fall back to showing the link to the advisor.
 */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  // Trimmed: a key pasted into the host with a stray space or line break is otherwise rejected (401).
  const key = process.env.RESEND_API_KEY?.trim().replace(/^["']|["']$/g, "");
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

/** To a teammate invited into an existing company (by a founder or the company's advisor). */
export function teammateInviteEmail(p: { inviterName: string; companyName: string; link: string; expiresInDays: number }) {
  const subject = `${p.inviterName} invited you to ${p.companyName} on Growth Goaled`;
  const text = `${p.inviterName} invited you to join ${p.companyName} on Growth Goaled, to see its conversations, recommendations and action plans.

Join here: ${p.link}

The link works once and expires in ${p.expiresInDays} days.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:480px">
<p style="font-size:15px">${escape(p.inviterName)} invited you to join <strong>${escape(p.companyName)}</strong> on Growth Goaled, to see its conversations, recommendations and action plans.</p>
<p><a href="${escape(p.link)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Join ${escape(p.companyName)}</a></p>
<p style="font-size:12px;color:#64748B">The link works once and expires in ${p.expiresInDays} days.</p>
</div>`;
  return { subject, text, html };
}

/** To the owner: a founder didn't find their question in the library ("Don't see what you're looking for?"). */
export function suggestionEmail(p: { companyName: string; founderName: string; email: string; decision: string }) {
  const subject = `New growth question request from ${p.companyName}`;
  const text = `${p.founderName} (${p.email}) at ${p.companyName} didn't find their question in the library.

What they're trying to decide:
${p.decision}

Reply to this founder at ${p.email}.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
<p style="font-size:15px"><strong>${escape(p.founderName)}</strong> (${escape(p.email)}) at <strong>${escape(p.companyName)}</strong> didn't find their question in the library.</p>
<p style="font-size:13px;color:#64748B;margin-bottom:4px">What they're trying to decide:</p>
<blockquote style="margin:0;padding:12px 16px;background:#F1F5F9;border-radius:8px;font-size:15px;white-space:pre-wrap">${escape(p.decision)}</blockquote>
<p style="font-size:13px;color:#64748B">Reply to them at <a href="mailto:${escape(p.email)}">${escape(p.email)}</a>.</p>
</div>`;
  return { subject, text, html };
}

/** To the founder: their advisor needs files or figures; the button opens the upload page. */
export function dataRequestEmail(p: { advisorName: string; companyName: string; items: string[]; message: string | null; link: string }) {
  const subject = `${p.advisorName} asked ${p.companyName} for an update`;
  const list = p.items.map((i) => `- ${i}`).join("\n");
  const text = `${p.advisorName} asked for an update from ${p.companyName}${p.items.length ? ":\n\n" + list : "."}${p.message ? `\n\n"${p.message}"` : ""}

Upload it here (drag and drop, any format): ${p.link}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
<p style="font-size:15px">${escape(p.advisorName)} asked for an update from <strong>${escape(p.companyName)}</strong>${p.items.length ? ":" : "."}</p>
${p.items.length ? `<ul style="font-size:15px;padding-left:20px">${p.items.map((i) => `<li>${escape(i)}</li>`).join("")}</ul>` : ""}
${p.message ? `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#F1F5F9;border-radius:8px;font-size:15px;white-space:pre-wrap">${escape(p.message)}</blockquote>` : ""}
<p><a href="${escape(p.link)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Upload the update</a></p>
<p style="font-size:12px;color:#64748B">Drag and drop any files: spreadsheets, PDFs, exports. They're kept in your Documents.</p>
</div>`;
  return { subject, text, html };
}

/** To the advisor: the founder answered a data request. */
export function dataReceivedEmail(p: { companyName: string; founderName: string; filename: string; link: string }) {
  const subject = `${p.companyName} shared an update`;
  const text = `${p.founderName} at ${p.companyName} shared ${p.filename} in answer to your request.

See it: ${p.link}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:480px">
<p style="font-size:15px">${escape(p.founderName)} at <strong>${escape(p.companyName)}</strong> shared <strong>${escape(p.filename)}</strong> in answer to your request.</p>
<p><a href="${escape(p.link)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">See their documents</a></p>
</div>`;
  return { subject, text, html };
}

/** To the advisor: the founder started their plan and handed some actions to Growth Goaled. */
export function growthGoaledWorkEmail(p: { companyName: string; founderName: string; planTitle: string; actions: string[]; link: string }) {
  const n = p.actions.length;
  const subject = `${p.companyName} assigned ${n} ${n === 1 ? "action" : "actions"} to Growth Goaled`;
  const text = `${p.founderName} started ${p.planTitle} and handed ${n} ${n === 1 ? "action" : "actions"} to Growth Goaled:

${p.actions.map((a) => `- ${a}`).join("\n")}

Review the work and quote anything beyond the plan: ${p.link}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
<p style="font-size:15px">${escape(p.founderName)} started <strong>${escape(p.planTitle)}</strong> and handed ${n} ${n === 1 ? "action" : "actions"} to Growth Goaled:</p>
<ul style="font-size:15px;padding-left:20px">${p.actions.map((a) => `<li>${escape(a)}</li>`).join("")}</ul>
<p><a href="${escape(p.link)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Review and quote the work</a></p>
</div>`;
  return { subject, text, html };
}

/** To the advisor: the founder chose who does each action on their plan, for review. */
export function planSplitEmail(p: { companyName: string; founderName: string; growthGoaled: string[]; founder: string[]; link: string }) {
  const subject = `${p.companyName} sent their action plan for review${p.growthGoaled.length ? ` (${p.growthGoaled.length} for Growth Goaled)` : ""}`;
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const text = `${p.founderName} chose who does each action on ${p.companyName}'s plan.
${p.growthGoaled.length ? `\nAssigned to Growth Goaled:\n${list(p.growthGoaled)}\n` : ""}${p.founder.length ? `\nThe founder's team:\n${list(p.founder)}\n` : ""}
Review it${p.growthGoaled.length ? " and quote Growth Goaled's share" : ""}: ${p.link}`;
  const ul = (xs: string[]) => `<ul style="font-size:15px;padding-left:20px">${xs.map((x) => `<li>${escape(x)}</li>`).join("")}</ul>`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
<p style="font-size:15px">${escape(p.founderName)} chose who does each action on <strong>${escape(p.companyName)}</strong>'s plan.</p>
${p.growthGoaled.length ? `<p style="font-size:13px;color:#64748B;margin-bottom:0">Assigned to Growth Goaled</p>${ul(p.growthGoaled)}` : ""}
${p.founder.length ? `<p style="font-size:13px;color:#64748B;margin-bottom:0">The founder's team</p>${ul(p.founder)}` : ""}
<p><a href="${escape(p.link)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Review the plan</a></p>
</div>`;
  return { subject, text, html };
}
