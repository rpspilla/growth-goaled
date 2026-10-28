/**
 * Growth Data Readiness requirements: the single source for what Growth Goaled
 * asks founders for, why, where it usually lives, and which growth metrics it
 * makes possible. Per-company status lives in the data_items table.
 */

export type CategoryId = "financial" | "customers" | "pipeline" | "marketing" | "product" | "team";
export type ItemStatus = "not_reviewed" | "available" | "partial" | "missing" | "not_applicable";
export type ItemQuality = "unverified" | "validated" | "estimated";
export type CollectionMethod = "file_upload" | "manual_entry" | "integration";

export type DataItemDef = {
  key: string;
  name: string;
  /** What we're asking for, in founder language. */
  description: string;
  /** Why it matters for the growth diagnosis. */
  why: string;
  required: boolean;
  /** Months of history the analysis needs (coverage shorter than this is flagged). */
  monthsNeeded?: number;
  /** Overrides the category's source list when an item usually lives elsewhere. */
  sources?: string[];
  /** The specific request shown when the item is missing or partial. */
  followUp: string;
  /** Columns a spreadsheet for this item should contain (each alternative matches a header loosely). */
  fields?: { label: string; match: string[] }[];
};

export type CategoryDef = {
  id: CategoryId;
  letter: string;
  name: string;
  summary: string;
  sources: string[];
  suggestedFiles: string[];
  items: DataItemDef[];
};

export const CATEGORIES: CategoryDef[] = [
  {
    id: "financial",
    letter: "A",
    name: "Financial performance",
    summary: "The last 12 months of financials, plus your current cash and runway.",
    sources: ["QuickBooks", "Xero", "Stripe", "Chargebee", "Maxio", "Ramp", "Brex", "Bank statements", "Excel or Google Sheets financial model"],
    suggestedFiles: ["Monthly profit and loss statement", "Cash flow statement", "Balance sheet", "Current cash / runway forecast", "Financial model"],
    items: [
      {
        key: "monthly_revenue",
        name: "Monthly revenue",
        description: "Revenue for each of the last 12 months, ideally split into recurring and non-recurring.",
        why: "Shows your real growth rate and how much of it is repeatable.",
        required: true,
        monthsNeeded: 12,
        followUp: "Share a monthly P&L or revenue report for the last 12 months, with recurring and one-off revenue split if you can.",
        fields: [
          { label: "month", match: ["month", "period", "date"] },
          { label: "revenue", match: ["revenue", "sales", "income", "mrr"] },
        ],
      },
      {
        key: "monthly_expenses",
        name: "Monthly expenses by category",
        description: "Spend for each month by category (people, software, marketing, hosting, etc.).",
        why: "Lets us see where money goes and how efficiently growth is bought.",
        required: true,
        monthsNeeded: 12,
        followUp: "Share a monthly P&L with expenses broken down by category for the last 12 months.",
      },
      {
        key: "cash_balances",
        name: "Monthly cash balances",
        description: "Your cash balance at the end of each month.",
        why: "Needed to track burn and runway over time.",
        required: true,
        monthsNeeded: 12,
        followUp: "Share month-end cash balances for the last 12 months (bank statements or a cash flow statement work).",
      },
      {
        key: "monthly_burn",
        name: "Monthly cash burn",
        description: "Net cash spent each month.",
        why: "Burn relative to new ARR shows how efficiently you're growing.",
        required: true,
        monthsNeeded: 12,
        followUp: "Share monthly net burn for the last 12 months, or a cash flow statement we can derive it from.",
      },
      {
        key: "current_cash",
        name: "Current cash balance",
        description: "Cash in the bank today.",
        why: "Sets how much room you have to invest in growth.",
        required: true,
        followUp: "Tell us your current cash balance and the date it's as of.",
      },
      {
        key: "runway",
        name: "Projected runway and assumptions",
        description: "How many months of runway you have and the assumptions behind it.",
        why: "Growth recommendations need to fit inside your runway.",
        required: true,
        followUp: "Share your current runway forecast, including the hiring and spend assumptions behind it.",
      },
      {
        key: "gross_margin",
        name: "Gross margin and cost of delivery",
        description: "Gross margin and what it costs to deliver your service (hosting, support, inference, implementation).",
        why: "Needed for CAC payback and to know how much each customer is really worth.",
        required: false,
        followUp: "Share gross margin, or the cost-of-revenue lines from your P&L.",
      },
      {
        key: "forecast_vs_actual",
        name: "Forecast versus actual",
        description: "Your revenue and expense forecast compared with actual results.",
        why: "Shows how predictable the business is and how realistic the plan is.",
        required: false,
        followUp: "Share last year's forecast next to actuals, if you have one.",
      },
    ],
  },
  {
    id: "customers",
    letter: "B",
    name: "Customer-level revenue and ICP",
    summary: "Who your customers are, what they pay, and why they buy.",
    sources: ["HubSpot", "Salesforce", "Pipedrive", "Stripe", "Chargebee", "Maxio", "QuickBooks", "Apollo", "Customer database", "Customer interviews and onboarding records"],
    suggestedFiles: ["Customer export", "Revenue-by-customer report", "Customer segmentation report", "Customer interview notes"],
    items: [
      {
        key: "customer_list",
        name: "Customer list with IDs",
        description: "Every customer or account, with a name and a unique identifier.",
        why: "The base list every customer-level analysis is built on.",
        required: true,
        followUp: "Export your customer list with a name and unique ID for each account.",
        fields: [
          { label: "customer name", match: ["customer", "account", "company", "name"] },
          { label: "customer ID", match: ["id", "identifier"] },
        ],
      },
      {
        key: "revenue_by_customer",
        name: "Revenue by customer",
        description: "What each customer paid, preferably by month.",
        why: "Needed for net revenue retention, concentration risk and ICP fit.",
        required: true,
        monthsNeeded: 12,
        followUp: "Export revenue by customer by month for the last 12 months (billing system or accounting).",
        fields: [
          { label: "customer", match: ["customer", "account", "company"] },
          { label: "revenue", match: ["revenue", "amount", "mrr", "arr", "billed"] },
          { label: "month", match: ["month", "period", "date", "invoice"] },
        ],
      },
      {
        key: "contract_metrics",
        name: "ARR, MRR or contract value",
        description: "ARR, MRR, ACV or contract value for each customer, whichever you track.",
        why: "Lets us compare deal sizes across segments and over time.",
        required: true,
        followUp: "Add ARR, MRR or contract value per customer to your customer export.",
        fields: [{ label: "ARR / MRR / contract value", match: ["arr", "mrr", "acv", "contract", "value"] }],
      },
      {
        key: "industry",
        name: "Industry and sub-industry",
        description: "Each customer's industry, and sub-industry if you track it.",
        why: "The main input for finding which segments convert and retain best.",
        required: true,
        followUp: "Add industry (and sub-industry if you have it) to your customer export.",
        fields: [{ label: "industry", match: ["industry", "vertical", "sector"] }],
      },
      {
        key: "company_size",
        name: "Customer company size",
        description: "Employee count or revenue band for each customer.",
        why: "Shows whether you win and retain better with smaller or larger companies.",
        required: true,
        followUp: "Add employee count or revenue band for each customer to your customer export.",
        fields: [{ label: "company size", match: ["employee", "size", "headcount", "band"] }],
      },
      {
        key: "use_case",
        name: "Use case and problem solved",
        description: "The main use case or problem each customer bought you for.",
        why: "Helps sharpen positioning around the problems you solve best.",
        required: false,
        followUp: "Add each customer's primary use case, or share onboarding notes or interview summaries.",
        fields: [{ label: "use case", match: ["use case", "usecase", "problem", "reason"] }],
      },
      {
        key: "start_term",
        name: "Start date and contract term",
        description: "When each customer started and how long their contract runs.",
        why: "Needed for cohorts, new-customer counts by month and CAC.",
        required: true,
        followUp: "Add start date and contract term for each customer.",
        fields: [
          { label: "start date", match: ["start", "signed", "created", "since"] },
          { label: "contract term", match: ["term", "length", "duration"] },
        ],
      },
      {
        key: "status_renewal",
        name: "Status, renewal date and expansion history",
        description: "Whether each customer is active or churned, when they renew, and any expansions or downgrades.",
        why: "Needed to measure retention and expansion accurately.",
        required: true,
        followUp: "Add customer status, renewal date and expansion or downgrade history to your customer export.",
        fields: [
          { label: "status", match: ["status", "active", "churn"] },
          { label: "renewal date", match: ["renewal", "renew", "end date"] },
        ],
      },
    ],
  },
  {
    id: "pipeline",
    letter: "C",
    name: "CRM pipeline and sales performance",
    summary: "Your opportunities, how they move through stages, and why you win or lose.",
    sources: ["HubSpot", "Salesforce", "Pipedrive", "Gong", "Outreach", "Salesloft", "Sales reports and spreadsheets"],
    suggestedFiles: ["Opportunity export", "Historical pipeline report", "Win/loss analysis", "Sales forecast"],
    items: [
      {
        key: "opportunities",
        name: "Open, won and lost opportunities",
        description: "All opportunities in your CRM, including closed won and closed lost.",
        why: "The basis for win rate, pipeline coverage and sales capacity.",
        required: true,
        monthsNeeded: 12,
        followUp: "Export all opportunities from the last 12 months, including won and lost deals.",
        fields: [
          { label: "opportunity", match: ["opportunity", "deal", "name"] },
          { label: "stage / outcome", match: ["stage", "status", "won", "lost"] },
        ],
      },
      {
        key: "opp_value_dates",
        name: "Opportunity value, created and close dates",
        description: "Deal value plus the date each opportunity was created and closed.",
        why: "Needed to measure sales cycle length and pipeline velocity.",
        required: true,
        followUp: "Make sure your opportunity export includes amount, created date and close date.",
        fields: [
          { label: "amount", match: ["amount", "value", "arr", "acv"] },
          { label: "created date", match: ["created", "create date", "open"] },
          { label: "close date", match: ["close", "closed"] },
        ],
      },
      {
        key: "stage_history",
        name: "Stage history and stage-change dates",
        description: "When each opportunity entered and left each stage, where your CRM keeps it.",
        why: "Shows where deals stall. Without it, historical conversion and stage analysis is limited.",
        required: false,
        followUp: "Export opportunity stage history (HubSpot deal stage history or Salesforce opportunity history).",
      },
      {
        key: "lead_source",
        name: "Lead or opportunity source",
        description: "Where each lead or opportunity came from (inbound, outbound, partner, referral, event).",
        why: "Needed to compare channels and calculate channel-level CAC.",
        required: true,
        followUp: "Add lead or opportunity source to your opportunity export.",
        fields: [{ label: "source", match: ["source", "channel", "origin"] }],
      },
      {
        key: "win_loss",
        name: "Win/loss outcome and reason",
        description: "Whether each closed deal was won or lost, and why.",
        why: "Win rate and loss reasons show whether the problem is pipeline or conversion.",
        required: true,
        followUp: "Add closed won/lost outcome and loss reason to your opportunity export, or share a win/loss analysis.",
        fields: [{ label: "loss reason", match: ["reason", "lost reason", "loss"] }],
      },
      {
        key: "sales_calls",
        name: "Recorded sales calls",
        description: "Recordings or transcripts of recent sales calls: discovery, demo or negotiation.",
        why: "Shows what actually happens on calls (qualification, messaging and objections), so the advice rests on more than the numbers.",
        required: false,
        followUp: "Upload at least 3 recent sales call recordings or transcripts. Exports from Gong, Chorus, Zoom or Fathom all work.",
      },
      {
        key: "sales_cycle",
        name: "Average and median sales cycle",
        description: "How long deals take to close, if you already report it.",
        why: "A key efficiency measure. We can calculate it from created and close dates.",
        required: false,
        followUp: "Share your sales cycle report, or include created and close dates so we can calculate it.",
      },
      {
        key: "stage_conversion",
        name: "Stage-to-stage conversion rates",
        description: "The share of deals that move from each stage to the next.",
        why: "Pinpoints which part of the funnel limits growth.",
        required: false,
        followUp: "Share a funnel or stage conversion report from your CRM.",
      },
      {
        key: "deal_terms",
        name: "Deal size, discounts, contract length and buyer type",
        description: "Per-deal details on discounts, contract length and who bought.",
        why: "Shows pricing discipline and which buyers close fastest.",
        required: false,
        followUp: "Add discount, contract length and buyer title to your opportunity export where you track them.",
      },
      {
        key: "sales_activity",
        name: "Sales activity and stakeholders",
        description: "Calls, emails, meetings and stakeholders involved per deal, where tracked.",
        why: "Helps explain long cycles and multi-threading gaps.",
        required: false,
        sources: ["Gong", "Outreach", "Salesloft", "HubSpot", "Salesforce"],
        followUp: "Share an activity report from Gong, Outreach, Salesloft or your CRM, if you use one.",
      },
    ],
  },
  {
    id: "marketing",
    letter: "D",
    name: "Marketing and demand generation",
    summary: "Where demand comes from, what it costs, and how it converts.",
    sources: ["Google Analytics 4", "Google Search Console", "HubSpot", "Salesforce", "Marketo", "Google Ads", "LinkedIn Ads", "Meta Ads", "Marketing attribution tool", "Spreadsheets"],
    suggestedFiles: ["Monthly marketing report", "Advertising spend export", "Lead-source report", "Funnel conversion report"],
    items: [
      {
        key: "web_traffic",
        name: "Website traffic by source and landing page",
        description: "Visits by channel and landing page.",
        why: "Shows which channels bring interested buyers to the site.",
        required: false,
        sources: ["Google Analytics 4", "HubSpot"],
        followUp: "Export monthly website sessions by source and landing page from GA4.",
      },
      {
        key: "leads_by_source",
        name: "Leads by original source and campaign",
        description: "New leads each month by original source and campaign.",
        why: "Without lead-source attribution, reliable channel-level CAC can't be calculated.",
        required: true,
        monthsNeeded: 12,
        followUp: "Export leads by original source and campaign for the last 12 months.",
        fields: [
          { label: "source", match: ["source", "channel", "campaign", "utm"] },
          { label: "date", match: ["date", "month", "created"] },
        ],
      },
      {
        key: "marketing_spend",
        name: "Marketing spend by month and channel",
        description: "What you spent on marketing each month, by channel (ads, events, content, agencies, tools).",
        why: "Needed for CAC and to see which channels pay back.",
        required: true,
        monthsNeeded: 12,
        followUp: "Share monthly marketing spend by channel for the last 12 months (ad platform exports or finance report).",
        fields: [
          { label: "month", match: ["month", "date", "period"] },
          { label: "channel", match: ["channel", "source", "platform", "campaign"] },
          { label: "spend", match: ["spend", "cost", "amount"] },
        ],
      },
      {
        key: "lead_to_meeting",
        name: "Lead-to-meeting conversion",
        description: "The share of leads that turn into a first meeting.",
        why: "Shows lead quality and follow-up speed.",
        required: false,
        followUp: "Share a funnel report showing leads and meetings booked by month.",
      },
      {
        key: "meeting_to_opp",
        name: "Meeting-to-opportunity conversion",
        description: "The share of first meetings that become qualified opportunities.",
        why: "Shows qualification quality.",
        required: false,
        followUp: "Share meetings and opportunities created by month.",
      },
      {
        key: "opp_to_customer",
        name: "Opportunity-to-customer conversion",
        description: "The share of opportunities that become customers.",
        why: "Combined with the earlier steps, this gives the full funnel.",
        required: false,
        followUp: "Share opportunities created and closed won by month.",
      },
      {
        key: "cpl_cac",
        name: "Cost per lead and CAC",
        description: "Cost per lead and customer acquisition cost, if you already calculate them.",
        why: "A core efficiency measure. We can calculate it from spend and new customers.",
        required: false,
        followUp: "Share your CAC calculation and the inputs behind it.",
      },
      {
        key: "marketing_pipeline",
        name: "Marketing-sourced pipeline and revenue",
        description: "Pipeline and closed revenue attributed to marketing.",
        why: "Shows marketing's real contribution to growth.",
        required: false,
        followUp: "Share a report of pipeline and closed revenue by original source.",
      },
      {
        key: "organic_search",
        name: "Organic search performance",
        description: "Search impressions, clicks and rankings.",
        why: "Indicates how much low-cost demand you can build.",
        required: false,
        sources: ["Google Search Console", "Google Analytics 4"],
        followUp: "Export the last 12 months of performance from Google Search Console.",
      },
      {
        key: "other_channels",
        name: "Referral, partner and outbound contribution",
        description: "Leads, pipeline and revenue from referrals, partners and outbound.",
        why: "These channels often have the best payback at Series A.",
        required: false,
        followUp: "Share pipeline and closed revenue from referral, partner and outbound sources.",
      },
    ],
  },
  {
    id: "product",
    letter: "E",
    name: "Product activation, retention and churn",
    summary: "How customers adopt the product, how long they stay, and why they leave.",
    sources: ["PostHog", "Amplitude", "Mixpanel", "Application database", "Stripe", "Chargebee", "Maxio", "HubSpot", "Intercom", "Zendesk", "Customer success platform"],
    suggestedFiles: ["Product analytics report", "Cohort retention report", "Subscription history", "Churn and renewal report"],
    items: [
      {
        key: "new_accounts",
        name: "New users and customer accounts",
        description: "New users and new customer accounts each month.",
        why: "The starting point for activation and retention cohorts.",
        required: true,
        monthsNeeded: 12,
        followUp: "Export new users and new accounts by month from your product analytics or database.",
      },
      {
        key: "activation",
        name: "Activation rate and time to first value",
        description: "The share of new accounts that reach your activation milestone, and how long it takes.",
        why: "Slow activation is a common hidden cause of churn.",
        required: false,
        followUp: "Share your activation definition and the share of new accounts reaching it.",
      },
      {
        key: "active_usage",
        name: "Weekly and monthly active users or accounts",
        description: "WAU/MAU or active accounts over time.",
        why: "Without usage data, we can't tell whether churn is a product or a sales problem.",
        required: true,
        monthsNeeded: 12,
        followUp: "Export weekly or monthly active users or accounts for the last 12 months from your product analytics.",
      },
      {
        key: "feature_adoption",
        name: "Feature adoption and usage frequency",
        description: "Which features accounts use and how often.",
        why: "Shows which capabilities drive retention and expansion.",
        required: false,
        followUp: "Share a feature adoption report from your product analytics.",
      },
      {
        key: "onboarding",
        name: "Onboarding completion and drop-off",
        description: "How many new accounts complete onboarding and where they drop off.",
        why: "Identifies early-life churn risk.",
        required: false,
        followUp: "Share onboarding funnel data from your product analytics or CS platform.",
      },
      {
        key: "churn",
        name: "Customer churn and cancellation dates",
        description: "Which customers churned and when.",
        why: "Needed for logo retention and churn trends.",
        required: true,
        monthsNeeded: 12,
        followUp: "Export churned customers with cancellation dates for the last 12 months.",
        fields: [
          { label: "customer", match: ["customer", "account", "company"] },
          { label: "cancellation date", match: ["cancel", "churn", "end"] },
        ],
      },
      {
        key: "churned_revenue",
        name: "Revenue lost to churn or contraction",
        description: "Revenue lost each month from churned and downgraded customers.",
        why: "Needed for gross and net revenue retention.",
        required: true,
        monthsNeeded: 12,
        followUp: "Share monthly churned and contraction MRR (billing system or subscription history).",
      },
      {
        key: "grr_nrr",
        name: "Gross and net revenue retention",
        description: "GRR and NRR, if you already report them.",
        why: "Key retention metrics. We can calculate them from revenue by customer.",
        required: false,
        followUp: "Share your GRR/NRR report, or the revenue-by-customer data behind it.",
      },
      {
        key: "renewals_expansions",
        name: "Renewals, expansions and downgrades",
        description: "Renewal outcomes and expansion or downgrade events.",
        why: "Shows how much growth comes from existing customers.",
        required: false,
        followUp: "Share renewal, expansion and downgrade history.",
      },
      {
        key: "support",
        name: "Support volume and recurring issues",
        description: "Ticket volume and the most common customer issues.",
        why: "Recurring issues often predict churn.",
        required: false,
        sources: ["Intercom", "Zendesk", "HubSpot", "Customer success platform"],
        followUp: "Export monthly ticket volume and top issue categories from your support tool.",
      },
      {
        key: "ai_costs",
        name: "Inference costs and usage-based margin (AI companies)",
        description: "Model inference costs, cost per active account and usage-based gross margin. Mark not applicable if you don't run AI workloads.",
        why: "For AI products, inference cost can change unit economics as you scale.",
        required: false,
        sources: ["Cloud and model provider billing", "Application database", "Spreadsheets"],
        followUp: "Share monthly inference costs and active accounts so we can calculate cost per account.",
      },
    ],
  },
  {
    id: "team",
    letter: "F",
    name: "Team, hiring and growth targets",
    summary: "Who does what today, who you plan to hire, and the targets you're working to.",
    sources: ["Rippling", "Gusto", "BambooHR", "Ashby", "Greenhouse", "Lever", "QuickBooks", "Notion", "Google Drive", "Excel or Google Sheets", "Board decks and operating plans"],
    suggestedFiles: ["Org chart", "Headcount and compensation summary", "Hiring plan", "Operating plan", "Board deck or financial forecast"],
    items: [
      {
        key: "org_chart",
        name: "Org chart and reporting lines",
        description: "Your current org chart.",
        why: "Shows who owns each part of the growth engine.",
        required: true,
        followUp: "Share your current org chart (a screenshot or export is fine).",
      },
      {
        key: "roster",
        name: "Employee roster, roles and start dates",
        description: "Everyone on the team, their role and start date.",
        why: "Needed for sales capacity and ramp analysis.",
        required: true,
        followUp: "Share a roster with role, team and start date for each person.",
        fields: [
          { label: "role", match: ["role", "title", "position"] },
          { label: "start date", match: ["start", "hire", "joined"] },
        ],
      },
      {
        key: "compensation",
        name: "Compensation and benefits by role or function",
        description: "Compensation by role or function. Totals by team are fine; individual salaries aren't needed.",
        why: "Needed to cost hiring plans and calculate fully loaded CAC.",
        required: true,
        followUp: "Share compensation totals by function or role (aggregated is fine).",
      },
      {
        key: "contractors",
        name: "Contractor and agency costs",
        description: "Monthly spend on contractors and agencies.",
        why: "Part of the true cost of growth.",
        required: false,
        followUp: "Share monthly contractor and agency spend.",
      },
      {
        key: "open_roles",
        name: "Open roles and planned hires",
        description: "Roles you're hiring for now and plan to hire.",
        why: "Lets us check the hiring plan against the constraints we find.",
        required: true,
        followUp: "Share your hiring plan with open and planned roles.",
      },
      {
        key: "hiring_dates_comp",
        name: "Expected hiring dates and compensation",
        description: "When each planned hire starts and what they'll cost.",
        why: "Needed to model the hiring plan against runway.",
        required: false,
        followUp: "Add target start dates and budgeted compensation to your hiring plan.",
      },
      {
        key: "targets",
        name: "Revenue and growth targets",
        description: "Revenue and growth targets by month or quarter.",
        why: "Recommendations are measured against the targets you've committed to.",
        required: true,
        followUp: "Share your revenue targets by month or quarter (operating plan or board deck).",
      },
      {
        key: "budgets",
        name: "Department budgets and headcount plans",
        description: "Budget and planned headcount by department.",
        why: "Shows how investment is planned across functions.",
        required: false,
        followUp: "Share department budgets and headcount plans from your operating plan.",
      },
      {
        key: "sales_capacity",
        name: "Sales capacity and productivity assumptions",
        description: "Quota, ramp time and productivity assumptions for sales reps.",
        why: "Tests whether the plan's sales capacity can hit the targets.",
        required: false,
        followUp: "Share quota, ramp and productivity assumptions per rep.",
      },
      {
        key: "founder_dependencies",
        name: "Founder dependencies and function ownership",
        description: "Which critical functions still depend on a founder, and who owns each function.",
        why: "Founder-led functions are often the first scaling constraint.",
        required: false,
        followUp: "List the functions that still depend on a founder, and who owns each function today.",
      },
    ],
  },
];

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  not_reviewed: "Not reviewed",
  available: "Available",
  partial: "Partially available",
  missing: "Missing",
  not_applicable: "Not applicable",
};

export const QUALITY_LABEL: Record<ItemQuality, string> = {
  unverified: "Unverified",
  validated: "Validated",
  estimated: "Estimated",
};

export const METHOD_LABEL: Record<CollectionMethod, string> = {
  file_upload: "File upload",
  manual_entry: "Manual entry",
  integration: "Integration",
};

const ITEMS = new Map(CATEGORIES.flatMap((c) => c.items.map((i) => [i.key, { ...i, category: c.id }] as const)));
export const ALL_ITEM_KEYS = [...ITEMS.keys()];

export function getCategory(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function getItem(key: string): (DataItemDef & { category: CategoryId }) | undefined {
  return ITEMS.get(key);
}

export function sourcesFor(item: DataItemDef, category: CategoryDef): string[] {
  return item.sources ?? category.sources;
}

// ---------------------------------------------------------------------------
// Growth metrics each item makes possible (analytical readiness)
// ---------------------------------------------------------------------------

export type MetricRequirement = {
  key: string;
  label: string;
  /** Items that must be available for the metric to be calculated. */
  needs: string[];
  /** Optional items that make the metric more reliable when present. */
  improves?: string[];
  /** What we can't do while it's blocked. */
  blockedMessage: string;
  /** Needed before the benchmark can run. */
  benchmarkCritical: boolean;
};

export const ANALYTIC_METRICS: MetricRequirement[] = [
  {
    key: "revenue_growth",
    label: "Revenue growth",
    needs: ["monthly_revenue"],
    blockedMessage: "Growth rate can't be measured without 12 months of monthly revenue.",
    benchmarkCritical: true,
  },
  {
    key: "burn_runway",
    label: "Burn and runway",
    needs: ["monthly_burn", "current_cash"],
    improves: ["cash_balances", "runway"],
    blockedMessage: "Burn multiple and runway can't be assessed without monthly burn and current cash.",
    benchmarkCritical: false,
  },
  {
    key: "gross_margin",
    label: "Gross margin",
    needs: ["gross_margin"],
    blockedMessage: "CAC payback can't account for margin until gross margin or cost of delivery is provided.",
    benchmarkCritical: false,
  },
  {
    key: "net_revenue_retention",
    label: "Net and gross revenue retention",
    needs: ["revenue_by_customer", "churned_revenue"],
    improves: ["status_renewal", "renewals_expansions", "grr_nrr"],
    blockedMessage: "NRR and GRR can't be calculated without revenue by customer and churned revenue.",
    benchmarkCritical: true,
  },
  {
    key: "icp_fit",
    label: "ICP fit by segment",
    needs: ["revenue_by_customer", "industry", "company_size"],
    improves: ["use_case", "status_renewal"],
    blockedMessage: "Segment-level ICP fit needs revenue by customer with industry and company size.",
    benchmarkCritical: false,
  },
  {
    key: "blended_cac",
    label: "Blended CAC and payback",
    needs: ["marketing_spend", "start_term"],
    improves: ["compensation", "gross_margin"],
    blockedMessage: "CAC can't be calculated without marketing spend and new-customer start dates.",
    benchmarkCritical: true,
  },
  {
    key: "channel_cac",
    label: "Channel-level CAC",
    needs: ["marketing_spend", "leads_by_source", "lead_source"],
    blockedMessage: "Marketing spend alone isn't enough: reliable channel-level CAC needs lead-source attribution.",
    benchmarkCritical: false,
  },
  {
    key: "sales_cycle",
    label: "Sales cycle",
    needs: ["opp_value_dates"],
    improves: ["stage_history"],
    blockedMessage: "Sales cycle can't be measured without opportunity created and close dates.",
    benchmarkCritical: true,
  },
  {
    key: "win_rate",
    label: "Win rate",
    needs: ["opportunities", "win_loss"],
    blockedMessage: "Win rate needs closed won and lost opportunities.",
    benchmarkCritical: true,
  },
  {
    key: "funnel_conversion",
    label: "Funnel conversion",
    needs: ["leads_by_source", "opportunities"],
    improves: ["stage_history", "lead_to_meeting", "meeting_to_opp"],
    blockedMessage: "Funnel conversion needs leads and opportunities; without stage history, historical conversion analysis is limited.",
    benchmarkCritical: false,
  },
  {
    key: "product_retention",
    label: "Usage and retention cohorts",
    needs: ["active_usage", "churn"],
    improves: ["new_accounts", "activation", "feature_adoption"],
    blockedMessage: "Without usage data, we can't tell whether churn is driven by product adoption.",
    benchmarkCritical: false,
  },
  {
    key: "sales_capacity",
    label: "Sales capacity and productivity",
    needs: ["roster", "opportunities", "targets"],
    improves: ["sales_capacity", "compensation"],
    blockedMessage: "AE productivity and capacity need the team roster, won deals and revenue targets.",
    benchmarkCritical: false,
  },
];
