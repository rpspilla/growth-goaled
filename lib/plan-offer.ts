/** What each action plan includes: the one list shown on the offer, the legend and anywhere else it's described. */
export type OfferPoint = { text: string; soon?: boolean };

export const PLAN_INCLUDES: OfferPoint[] = [
  { text: "Built from this conversation and your data" },
  { text: "Reviewed and approved by a Growth Goaled advisor" },
  { text: "Delivered within about 24 hours of submitting" },
  { text: "Yours to run; no ongoing support" },
];

export const SUPPORTED_INCLUDES: OfferPoint[] = [
  { text: "Everything in the action plan, kept up to date" },
  { text: "Unlimited chat with your CRO advisor, right in this conversation" },
  { text: "2 hours live with your advisor every month" },
  { text: "Milestones tracked as you go" },
  { text: "Slack, Claude and ChatGPT integrations", soon: true },
  { text: "Cancel any time" },
];

/** The supported plan in one line. */
export const SUPPORTED_SUMMARY = "unlimited chat with your CRO advisor plus 2 hours live with them every month";
