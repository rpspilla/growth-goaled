import { headers } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { LinkRowActions } from "@/components/payment-links/LinkRowActions";
import { PaymentLinkForm } from "@/components/payment-links/PaymentLinkForm";
import { Pill } from "@/components/ui/Pill";
import { requireRole } from "@/lib/auth/session";
import { listManagedCompanies } from "@/lib/data/companies";
import { linkUrl, listPaymentLinks } from "@/lib/data/payment-links";
import { formatPrice } from "@/lib/pricing";
import { cancelPaymentLinkAction, createPaymentLinkAction } from "./actions";

const STATUS = { open: { label: "Waiting for payment", tone: "amber" }, paid: { label: "Paid", tone: "green" }, cancelled: { label: "Cancelled", tone: "neutral" } } as const;
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Custom projects: an advisor sets the amount and what it covers, and sends the client a link to pay. */
export default async function PaymentLinksPage() {
  const user = await requireRole(["advisor", "admin"]);
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [links, companies] = await Promise.all([listPaymentLinks(user), listManagedCompanies(user)]);
  const card = { background: "var(--card)", borderColor: "var(--border)" };
  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-8">
      <PageHeader title="Payment links" />
      <p className="text-base -mt-4" style={{ color: "var(--muted-foreground)" }}>
        For custom projects: set the amount and what it covers, then send the link. The client pays by card through Stripe; they don&apos;t need an account. You&apos;re emailed when it&apos;s paid.
      </p>
      <div className="grid lg:grid-cols-5 gap-6 items-start">
        <section className="lg:col-span-2 rounded-xl border p-5" style={card}>
          <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--foreground)" }}>New payment link</h2>
          <PaymentLinkForm action={createPaymentLinkAction} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
        </section>
        <section aria-label="Your payment links" className="lg:col-span-3 rounded-xl border overflow-hidden" style={card}>
          <div className="px-5 py-3 border-b label" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {user.role === "admin" ? "All payment links" : "Your payment links"} ({links.length})
          </div>
          {links.length === 0 && <p className="px-5 py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>None yet.</p>}
          <ul>
            {links.map((l) => (
              <li key={l.id} className="px-5 py-4 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[12rem]">
                    <div className="font-semibold" style={{ color: "var(--foreground)" }}>{l.title}</div>
                    <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {[l.clientName, l.clientEmail, l.company].filter(Boolean).join(" · ") || "No client details"} · created {day(l.createdAt)}
                      {user.role === "admin" && l.author ? ` by ${l.author}` : ""}
                    </div>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{formatPrice(l.amountCents)}</div>
                  <Pill tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Pill>
                </div>
                {l.status === "paid" && <p className="text-sm" style={{ color: "var(--green)" }}>Paid {l.paidAt ? day(l.paidAt) : ""}{l.paidEmail ? ` by ${l.paidEmail}` : ""}.</p>}
                {l.status === "open" && <LinkRowActions id={l.id} url={linkUrl(appUrl, l.token)} title={l.title} cancel={cancelPaymentLinkAction} />}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
