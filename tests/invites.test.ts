import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, INVITE_TTL_DAYS, inviteStatus, safeNextPath, sameEmail } from "@/lib/invites";

describe("invite tokens", () => {
  it("stores only a hash that matches the emailed token", () => {
    const { token, hash } = generateInviteToken();
    expect(hash).toBe(hashInviteToken(token));
    expect(hash).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("are unique and expire in 14 days", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.token).not.toBe(b.token);
    const days = (a.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(INVITE_TTL_DAYS - 0.01);
    expect(days).toBeLessThanOrEqual(INVITE_TTL_DAYS);
  });
});

describe("inviteStatus", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("is valid until expiry, then expired; accepted wins", () => {
    expect(inviteStatus({ expiresAt: new Date("2026-10-23T00:00:00Z"), acceptedAt: null }, now)).toBe("valid");
    expect(inviteStatus({ expiresAt: new Date("2026-10-22T12:00:00Z"), acceptedAt: null }, now)).toBe("expired");
    expect(inviteStatus({ expiresAt: new Date("2026-10-23T00:00:00Z"), acceptedAt: now }, now)).toBe("accepted");
  });
});

describe("sameEmail", () => {
  it("ignores case and surrounding space", () => {
    expect(sameEmail("Sam@Acme.com ", "sam@acme.com")).toBe(true);
    expect(sameEmail("sam@acme.com", "sam@acme.co")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
