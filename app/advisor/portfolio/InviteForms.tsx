"use client";

import { useActionState, useState } from "react";
import { inviteFounder, resendInviteAction, type InviteFormState } from "./actions";

const inputClass = "w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2";
const inputStyle = { background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" };

/** Outcome of sending an invite: confirmation, or the link to share when email isn't available. */
function InviteOutcome({ state }: { state: InviteFormState }) {
  const [copied, setCopied] = useState(false);
  const r = state.result;
  if (!r) return null;
  if (!r.ok) {
    return (
      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--red-muted)", color: "var(--red)" }}>
        {r.error}
      </div>
    );
  }
  return (
    <div className="rounded-lg p-3 text-xs space-y-2" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
      <div className="font-semibold">
        {r.emailed ? `Invite emailed${state.email ? ` to ${state.email}` : ""}.` : "Invite created. Share this link with the founder:"}
      </div>
      {!r.emailed && r.emailNote && <div style={{ color: "var(--muted-foreground)" }}>{r.emailNote}</div>}
      <div className="flex items-center gap-2">
        <input readOnly value={r.link} className="flex-1 px-2 py-1.5 rounded border font-mono" style={{ ...inputStyle, fontSize: "11px" }} />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(r.link).then(() => setCopied(true))}
          className="px-2.5 py-1.5 rounded font-semibold"
          style={{ background: "var(--green)", color: "#fff" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div style={{ color: "var(--muted-foreground)" }}>Single use · expires in 14 days. The link isn&apos;t shown again.</div>
    </div>
  );
}

export function InviteFounderForm() {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(inviteFounder, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="invite-email" className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
            Founder email
          </label>
          <input id="invite-email" name="email" type="email" required placeholder="founder@company.com" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="invite-company" className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
            Company name
          </label>
          <input id="invite-company" name="companyName" required placeholder="Acme AI" className={inputClass} style={inputStyle} />
        </div>
      </div>
      <InviteOutcome state={state} />
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--green)", color: "#fff" }}
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}

export function ResendInviteButton({ inviteId }: { inviteId: string }) {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(resendInviteAction, {});
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="inviteId" value={inviteId} />
        <button type="submit" disabled={pending} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
          {pending ? "Sending…" : "Resend"}
        </button>
      </form>
      <InviteOutcome state={state} />
    </div>
  );
}
