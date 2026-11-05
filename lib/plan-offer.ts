/**
 * The packaging founders see under a recommendation (owner's offer, Nov 2026): Explore (free),
 * Diagnose ($499 once: the action plan), Execute & Monitor (monthly: the supported plan), and custom
 * projects. Prices come from lib/pricing; the words live here so every place says the same thing.
 */
export type OfferPoint = { text: string; soon?: boolean };

export const EXPLORE = {
  name: "Explore",
  tagline: "Ask questions. Understand your growth.",
  points: [{ text: "Unlimited growth conversations" }, { text: "CRO-level recommendations" }, { text: "Initial review of your business data" }, { text: "Identify potential growth problems" }] as OfferPoint[],
  cta: "Start Exploring",
};

export const DIAGNOSE = {
  name: "Diagnose",
  tagline: "Find your biggest revenue bottleneck.",
  points: [
    { text: "Analysis of your company data" },
    { text: "Identify your biggest revenue leak" },
    { text: "CRO-reviewed diagnosis" },
    { text: "One prioritised improvement initiative" },
    { text: "Owner, targets and milestones" },
    { text: "30/60/90-day action plan" },
  ] as OfferPoint[],
  cta: "Diagnose My Growth",
};

export const EXECUTE = {
  name: "Execute & Monitor",
  tagline: "Turn your growth plan into measurable progress, with a CRO advisor alongside you.",
  lead: "Everything in Diagnose, plus:",
  points: [
    { text: "Ongoing growth plan and initiative tracking" },
    { text: "Assign owners and deadlines" },
    { text: "Monitor performance against targets" },
    { text: "Identify emerging revenue bottlenecks" },
    { text: "AI-powered recommendations and next steps" },
    { text: "Monthly progress reviews with your CRO advisor" },
    { text: "Two hours of live CRO support each month" },
    { text: "Slack, Claude and ChatGPT integrations", soon: true },
  ] as OfferPoint[],
  cta: "Start Improving Revenue",
};

export const CUSTOM = {
  name: "Custom Projects",
  from: "Starting at $5,000",
  tagline: "Need more hands-on help?",
  points: ["Sales process redesign", "Pipeline and forecasting overhaul", "GTM strategy and sales playbooks", "Sales team structure and compensation"],
  note: "Fixed scope and pricing · Free 30-minute scoping call",
  cta: "Discuss a Project",
  /** Straight to the 30-minute scoping call on Calendly. */
  href: "https://calendly.com/spillane-ryan/new-meeting",
};

/** The monthly plan in one line, for anywhere that describes it in passing. */
export const SUPPORTED_SUMMARY = "a CRO advisor alongside you, with monthly progress reviews and two hours of live CRO support each month";
