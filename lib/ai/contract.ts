import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { e2eEnabled } from "@/lib/e2e";
import { AI_MODEL, anthropic } from "./config";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/** What's read from a signed contract: the same fields the contracts list keeps, plus its key terms. */
export const contractReadSchema = z.object({
  title: z.string().nullable(),
  status: z.enum(["draft", "active", "ended"]).nullable(),
  billingCycle: z.enum(["one_time", "monthly", "quarterly", "annual"]).nullable(),
  /** Amount per bill in US dollars (not annual totals unless billed annually). */
  amount: z.number().nullable(),
  startDate: day,
  endDate: day,
  nextBillingDate: day,
  keyTerms: z.string().nullable(),
});
export type ContractRead = z.infer<typeof contractReadSchema>;

export type ContractInput =
  | { kind: "pdf"; filename: string; base64: string }
  | { kind: "image"; filename: string; base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" }
  | { kind: "text"; filename: string; text: string };

const SYSTEM = `You read a signed contract between Growth Goaled (a revenue advisory firm) and a client company, and pull out the facts its advisors track. Today is ${"{{today}}"}.

Return:
- title: a short name for the agreement as the document names it (e.g. "Execute & Monitor Services Agreement", "Statement of Work: Sales Hiring"). Null if unclear.
- status: "active" if signed and in force today, "ended" if its term has finished or it was terminated, "draft" if unsigned or marked draft. Null if you can't tell.
- billingCycle: how often the client is billed: "monthly", "quarterly", "annual" or "one_time" (a single fee or fixed project price). Null if not stated.
- amount: the amount charged per bill, in US dollars, as a number (for "$1,199 per month" give 1199; for a $12,000 fixed fee billed once give 12000). Null if not stated. Never invent a figure.
- startDate, endDate: the term's start (effective date) and end, as YYYY-MM-DD. Null if not stated; an evergreen contract has no end date.
- nextBillingDate: only if the contract states a specific first or next invoice date, as YYYY-MM-DD; otherwise null.
- keyTerms: 2–5 short lines, one per line, a reader can scan instead of opening the file: the parties, the scope, payment terms (e.g. net 15, paid in advance), renewal and notice, termination. Plain text, no markdown. Null if the document isn't a contract.
Only report what the document says. Dates written like "1st November 2026" become 2026-11-01.`;

function content(input: ContractInput): Anthropic.Beta.BetaContentBlockParam[] {
  const ask = { type: "text" as const, text: `Contract file: ${input.filename}. Pull out the fields.` };
  switch (input.kind) {
    case "pdf":
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 }, title: input.filename }, ask];
    case "image":
      return [{ type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } }, ask];
    case "text":
      return [{ type: "text", text: `Contract text:\n\n${input.text.slice(0, 60000)}` }, ask];
  }
}

export class ContractReadError extends Error {}

/** Reads a contract's fields with Claude (in test mode, a fixed answer so pages can be checked). */
export async function readContract(input: ContractInput, today: string): Promise<ContractRead> {
  if (e2eEnabled())
    return { title: "Test mode: Execute & Monitor agreement", status: "active", billingCycle: "monthly", amount: 1199, startDate: "2026-11-01", endDate: "2027-10-31", nextBillingDate: null, keyTerms: "Parties: Growth Goaled and the client\nScope: monthly CRO support\nPayment: net 15, billed in advance" };
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM.replace("{{today}}", today),
    output_config: { effort: "low", format: betaZodOutputFormat(contractReadSchema) },
    messages: [{ role: "user", content: content(input) }],
  });
  if (response.stop_reason === "refusal") throw new ContractReadError("The contract couldn't be read (declined by the model).");
  const parsed = contractReadSchema.safeParse(response.parsed_output);
  if (!parsed.success) throw new ContractReadError("Reading the contract returned an unexpected format.");
  return parsed.data;
}
