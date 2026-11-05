/** What an advisor can put on a custom-project payment link. */
import { describe, expect, it } from "vitest";
import { paymentLinkInput, toCents } from "@/lib/payment-links";

const base = { title: "Sales process redesign", amount: "5000" };

describe("payment link input", () => {
  it("takes dollars and cents, and keeps optional fields empty as null", () => {
    expect(paymentLinkInput.parse(base)).toMatchObject({ title: "Sales process redesign", amount: 5000, description: "", clientName: null, clientEmail: null, companyId: null, sendEmail: false });
    expect(paymentLinkInput.parse({ ...base, amount: "5000.50" }).amount).toBe(5000.5);
    expect(toCents(5000.1)).toBe(500010);
    expect(toCents(19.99)).toBe(1999);
  });
  it("rejects bad amounts, titles, emails and company ids", () => {
    for (const amount of ["", "abc", "0", "-5", "250001", "10.005"]) expect(paymentLinkInput.safeParse({ ...base, amount }).success).toBe(false);
    expect(paymentLinkInput.safeParse({ ...base, title: "x" }).success).toBe(false);
    expect(paymentLinkInput.safeParse({ ...base, clientEmail: "nope" }).success).toBe(false);
    expect(paymentLinkInput.safeParse({ ...base, clientEmail: " Pat@Acme.com " }).data?.clientEmail).toBe("pat@acme.com");
    expect(paymentLinkInput.safeParse({ ...base, companyId: "x" }).success).toBe(false);
  });
});
