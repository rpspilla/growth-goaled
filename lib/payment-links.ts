import { z } from "zod";

/** Custom-project payment links: the rules for what an advisor can send (no database here). */
export const MIN_LINK_DOLLARS = 1;
export const MAX_LINK_DOLLARS = 250_000;

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

export const paymentLinkInput = z.object({
  title: z.string().trim().min(3, "Give it a title the client will recognise.").max(120),
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters.").default(""),
  amount: z.coerce
    .number({ error: "Enter the amount in dollars." })
    .refine((n) => Number.isFinite(n), "Enter the amount in dollars.")
    .refine((n) => n >= MIN_LINK_DOLLARS && n <= MAX_LINK_DOLLARS, `Enter an amount between $${MIN_LINK_DOLLARS} and $${MAX_LINK_DOLLARS.toLocaleString("en-US")}.`)
    .refine((n) => Math.round(n * 100) === Math.round(n * 100 * 1000) / 1000, "Use dollars and cents, e.g. 5000 or 5000.50."),
  clientName: optional(120),
  clientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email, or leave it blank."),
  companyId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.uuid().safeParse(v).success, "Choose a company from the list."),
  sendEmail: z.boolean().default(false),
});
export type PaymentLinkInput = z.output<typeof paymentLinkInput>;

/** Dollars to integer cents, without float drift (5000.1 → 500010). */
export const toCents = (dollars: number) => Math.round(dollars * 100);
