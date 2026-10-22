import { z } from "zod";

export const STAGES = ["Pre-seed", "Seed", "Series A", "Series B+"] as const;

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

export const founderOnboardingSchema = staffProfileSchema.extend({
  companyName: z.string().trim().min(1, "Enter your company name.").max(160),
  website,
  stage: z.enum(STAGES, { error: "Choose your stage." }),
});

export type FounderOnboarding = z.infer<typeof founderOnboardingSchema>;

export const needsOnboarding = (user: { onboardedAt: Date | null }) => user.onboardedAt === null;
