"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pill } from "@/components/ui/Pill";

type Result = { ok: boolean; error?: string; link?: string; emailed?: boolean; emailNote?: string };
export type TeamMember = { userId: string; name: string | null; email: string; role: "owner" | "member"; since: string };
export type TeamInvite = { id: string; email: string; expired: boolean };

/**
 * Who has access to the company, invites waiting to be accepted, and a form to invite a teammate.
 * Used by founders (Team) and advisors (a company's People section).
 */
export function TeamPanel({
  members,
  invites,
  meId,
  canRemove,
  invite,
  cancel,
  remove,
}: {
  members: TeamMember[];
  invites: TeamInvite[];
  meId: string | null;
  canRemove: boolean;
  invite: (email: string) => Promise<Result>;
  cancel: (inviteId: string) => Promise<Result>;
  remove: (userId: string) => Promise<Result>;
}) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<Result>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });
  };
  return (
    <div className="space-y-5">
      <form
        aria-label="Invite a teammate"
        className="flex gap-2 items-end flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            setCopied(false);
            const r = await invite(email);
            setResult(r.ok ? r : null);
            if (!r.ok) return setError(r.error ?? "Couldn't send the invite.");
            setEmail("");
            router.refresh();
          });
        }}
      >
        <label className="flex-1 min-w-[16rem] space-y-1">
          <span className="label">Teammate&apos;s email</span>
          <input type="email" required className="field w-full" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
      </form>
      {result?.ok && result.link && (
        <div role="status" className="rounded-lg p-3 space-y-2 text-sm" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
          <div className="font-semibold">{result.emailed ? "Invite sent. You can also share this link:" : "Invite created. Share this link with them:"}</div>
          {!result.emailed && result.emailNote && <div style={{ color: "var(--muted-foreground)" }}>The email didn&apos;t go out ({result.emailNote}).</div>}
          <div className="flex gap-2 flex-wrap">
            <input readOnly aria-label="Invite link" value={result.link} className="field flex-1 min-w-[16rem] font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(result.link!).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <div style={{ color: "var(--muted-foreground)" }}>Single use · expires in 14 days. The link isn&apos;t shown again.</div>
        </div>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}

      <section aria-label="People with access">
        <h3 className="label mb-2">People with access ({members.length})</h3>
        <ul className="divide-y rounded-xl border" style={{ borderColor: "var(--border)" }}>
          {members.map((m) => (
            <li key={m.userId} className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
              <div className="flex-1 min-w-[12rem]">
                <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{m.name || m.email}{m.userId === meId ? " (you)" : ""}</div>
                {m.name && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{m.email}</div>}
              </div>
              <Pill tone={m.role === "owner" ? "green" : "neutral"}>{m.role === "owner" ? "Owner" : "Member"}</Pill>
              {canRemove && m.userId !== meId && (
                <button type="button" className="text-sm link" disabled={pending} aria-label={`Remove ${m.email}`} onClick={() => act(() => remove(m.userId), `Remove ${m.email}? They'll lose access to this company.`)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section aria-label="Pending invites">
          <h3 className="label mb-2">Waiting to accept ({invites.length})</h3>
          <ul className="divide-y rounded-xl border" style={{ borderColor: "var(--border)" }}>
            {invites.map((i) => (
              <li key={i.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                <span className="flex-1 min-w-[12rem]">{i.email}</span>
                <Pill tone={i.expired ? "neutral" : "amber"}>{i.expired ? "Expired" : "Invited"}</Pill>
                <button type="button" className="text-sm link" disabled={pending} aria-label={`Cancel invite for ${i.email}`} onClick={() => act(() => cancel(i.id))}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
