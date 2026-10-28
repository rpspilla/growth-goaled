import { z } from "zod";

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

/** Normalises "acme.com" / "https://acme.com/" to an https URL; empty → null. */
const website = z
  .string()
  .trim()
  .max(255)
  .transform((v, ctx) => {
    if (!v) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      if (!url.hostname.includes(".")) throw new Error();
      return url.origin;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid website, e.g. acme.com." });
      return z.NEVER;
    }
  });

export const staffProfileSchema = z.object({ name, title });

/** Invited founders (their company already exists) only confirm their name; title is optional. */
export const founderProfileSchema = z.object({ name, title: z.string().trim().max(120).optional().transform((v) => v || null) });

/** Founders: only what the first growth question needs. Title is optional (it can be added later). */
export const founderOnboardingSchema = z.object({
  name,
  title: z.string().trim().max(120).optional().transform((v) => v || null),
  companyName: z.string().trim().min(1, "Enter your company name.").max(160),
  website,
  revenueBand: z.enum(bandValues, { error: "Choose your annual revenue." }),
});

export type FounderOnboarding = z.infer<typeof founderOnboardingSchema>;

export const needsOnboarding = (user: { onboardedAt: Date | null }) => user.onboardedAt === null;
