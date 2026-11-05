"use client";

import { useActionState, useState } from "react";
import type { PaymentLinkFormState } from "@/app/advisor/payment-links/actions";

type Action = (prev: PaymentLinkFormState, fd: FormData) => Promise<PaymentLinkFormState>;

/** Title, what it covers, amount, and who it's for; the link comes back to copy, and can be emailed. */
export function PaymentLinkForm({ action, companies }: { action: Action; companies: { id: string; name: string }[] }) {
  const [state, submit, pending] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  return (
    <form action={submit} className="space-y-3" aria-label="New payment link">
      <div className="space-y-1">
        <label htmlFor="pl-title" className="label">Project title</label>
        <input id="pl-title" name="title" required maxLength={120} className="field w-full" placeholder="e.g. Sales process redesign" />
      </div>
      <div className="space-y-1">
        <label htmlFor="pl-description" className="label">What it covers (shown to the client)</label>
        <textarea id="pl-description" name="description" rows={4} maxLength={2000} className="field w-full" placeholder="Scope, deliverables and timing." />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="pl-amount" className="label">Amount (USD)</label>
          <input id="pl-amount" name="amount" required inputMode="decimal" className="field w-full" placeholder="5000" />
        </div>
        <div className="space-y-1">
          <label htmlFor="pl-company" className="label">Company (optional)</label>
          <select id="pl-company" name="companyId" className="field w-full" defaultValue="">
            <option value="">Not in Growth Goaled yet</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pl-client-name" className="label">Client name (optional)</label>
          <input id="pl-client-name" name="clientName" maxLength={120} className="field w-full" />
        </div>
        <div className="space-y-1">
          <label htmlFor="pl-client-email" className="label">Client email (optional)</label>
          <input id="pl-client-email" name="clientEmail" type="email" className="field w-full" placeholder="founder@company.com" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}>
        <input type="checkbox" name="sendEmail" /> Email the link to the client now
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create payment link"}</button>
      {state && !state.ok && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.error}</p>}
      {state?.ok && state.url && (
        <div role="status" className="rounded-lg p-3 space-y-2 text-sm" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
          <div className="font-semibold">Link ready{state.emailed ? " and emailed to the client" : ""}.</div>
          <div className="flex gap-2 items-center flex-wrap">
            <input readOnly aria-label="Payment link" value={state.url} className="field flex-1 min-w-[16rem]" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(state.url!).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
          </div>
          {state.emailed === false && <p style={{ color: "var(--red)" }}>The email wasn&apos;t sent ({state.emailError}). Copy the link and send it yourself.</p>}
        </div>
      )}
    </form>
  );
}
