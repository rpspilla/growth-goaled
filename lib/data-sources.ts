/**
 * The data the founder and advisor collect for every growth project (Founder View redesign): CRM
 * deals first, then billing and accounting. For now each comes in as an export; live connections
 * to each service come later, one at a time.
 */
export type DataSource = { id: string; title: string; what: string; export: string; match: RegExp };

export const DATA_SOURCE_GROUPS: { id: string; title: string; lead: string; sources: DataSource[] }[] = [
  {
    id: "crm",
    title: "CRM data",
    lead: "From HubSpot, Salesforce, Pipedrive or wherever you track deals.",
    sources: [
      { id: "won", title: "Won deals", what: "Every deal you've won in the last 12–24 months.", export: "Deal name, owner, created date, close date, amount, stage", match: /won|closed[- _]?won|bookings/i },
      { id: "lost", title: "Lost deals", what: "Deals you lost, with the reason where you have it.", export: "Deal name, owner, created date, close date, amount, loss reason", match: /lost|closed[- _]?lost/i },
      { id: "pipeline", title: "Pipeline", what: "Every open deal today.", export: "Deal name, owner, stage, amount, created date, expected close date", match: /pipeline|open deals|opportunit/i },
      { id: "history", title: "Deal history", what: "How deals moved between stages over time.", export: "Deal name, stage, date entered stage", match: /deal history|stage history|deal stage/i },
      { id: "activity", title: "Sales activity", what: "Calls, emails and meetings, where your CRM records them.", export: "Owner, activity type, date, deal or contact", match: /activit|calls|meetings|emails/i },
    ],
  },
  {
    id: "billing",
    title: "Billing and financial data",
    lead: "What you charge and collect, from your billing and accounting tools.",
    sources: [
      { id: "stripe", title: "Stripe", what: "Subscription metrics (monthly) or invoices: MRR, new, expansion and churned revenue.", export: "Billing › Subscriptions › Export, or Revenue › Subscription metrics › Export (monthly)", match: /stripe|subscription[_ -]?metrics/i },
      { id: "xero", title: "Xero", what: "Profit and loss, and invoices by customer.", export: "Accounting › Reports › Profit and Loss (monthly), and Sales › Invoices export", match: /xero/i },
      { id: "quickbooks", title: "QuickBooks", what: "Profit and loss, and sales by customer.", export: "Reports › Profit and Loss (by month), and Sales by Customer Detail", match: /quickbooks|qbo/i },
      { id: "other", title: "Other billing or accounting", what: "Chargebee, Recurly, NetSuite, a revenue spreadsheet…", export: "Revenue by customer by month (customer, month, amount)", match: /chargebee|recurly|netsuite|revenue|mrr|arr/i },
    ],
  },
];

/** Pure: the newest file whose name suggests it covers a source (a hint, not a guarantee). */
export function latestFor<T extends { filename: string; createdAt: Date }>(source: DataSource, files: T[]): T | null {
  return files.filter((f) => source.match.test(f.filename)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}
