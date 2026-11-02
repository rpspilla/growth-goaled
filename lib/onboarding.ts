import { z } from "zod";
import { FUNDING_STAGES, FOUNDING_YEARS, VERTICALS } from "@/lib/intake";

/** Annual revenue bands asked at onboarding (values match the revenue_band enum). */
export const REVENUE_BANDS = [
  { value: "lt_1m", label: "<$1M" },
  { value: "1m_3m", label: "$1M–$3M" },
  { value: "3m_10m", label: "$3M–$10M" },
  { value: "10m_20m", label: "$10M–$20M" },
  { value: "20m_50m", label: "$20M–$50M" },
] as const;

type RevenueBand = (typeof REVENUE_BANDS)[number]["value"];
const bandValues = REVENUE_BANDS.map((b) => b.value) as [RevenueBand, ...RevenueBand[]];

const name = z.string().trim().min(1, "Enter your name.").max(120);
const title = z.string().trim().min(1, "Enter your title.").max(120);

export const staffProfileSchema = z.object({ name, title });

/** Invited founders (their company already exists) only confirm their name; title is optional. */
export const founderProfileSchema = z.object({ name, title: z.string().trim().max(120).optional().transform((v) => v || null) });

/** A headcount: a whole number from 0 to 9,999. Empty is allowed only when `optional`. */
const headcount = (label: string, optional: boolean) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") {
        if (optional) return null;
        ctx.addIssue({ code: "custom", message: `Enter the number of ${label} (0 if none).` });
        return z.NEVER;
      }
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isInteger(n) || n < 0 || n > 9999) {
        ctx.addIssue({ code: "custom", message: "Enter a whole number, e.g. 3." });
        return z.NEVER;
      }
      return n;
    });

const pick = <T extends readonly [string, ...string[]]>(values: T, message: string) => z.enum(values as unknown as [T[number], ...T[number][]], { error: message });

/**
 * The six company basics asked before the free Snapshot (owner decision, Nov 2 2026): name, ARR,
 * founding year, vertical, funding stage and go-to-market team size. Everything else in the profile
 * is optional and comes after the Snapshot.
 */
export const companyBasicsSchema = z
  .object({
    companyName: z.string().trim().min(1, "Enter your company name.").max(160),
    revenueBand: z.enum(bandValues, { error: "Choose your annual revenue." }),
    foundedYear: pick(FOUNDING_YEARS as unknown as [string, ...string[]], "Choose your founding year."),
    vertical: pick(VERTICALS, "Choose your vertical."),
    verticalOther: z.string().trim().max(120).optional().transform((v) => v || null),
    stage: pick(FUNDING_STAGES, "Choose your funding stage."),
    aes: headcount("account executives", false),
    bdrs: headcount("BDRs", true),
    cs: headcount("customer success staff", true),
  })
  .superRefine((v, ctx) => {
    if (v.vertical === "Other" && !v.verticalOther) ctx.addIssue({ code: "custom", path: ["verticalOther"], message: "Tell us your vertical." });
  });

export type CompanyBasics = z.infer<typeof companyBasicsSchema>;

/** Founders: their name, an optional title, and the company basics. */
export const founderOnboardingSchema = z
  .object({
    name,
    title: z.string().trim().max(120).optional().transform((v) => v || null),
  })
  .and(companyBasicsSchema);

export type FounderOnboarding = z.infer<typeof founderOnboardingSchema>;

export const needsOnboarding = (user: { onboardedAt: Date | null }) => user.onboardedAt === null;
