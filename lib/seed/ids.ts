import { createHash } from "node:crypto";

/** Deterministic UUID for a seed row, so re-seeding replaces rows instead of duplicating them. */
export function seedId(key: string): string {
  const h = createHash("sha256").update(`growth-goaled-seed:${key}`).digest("hex");
  // Shape as an RFC 4122 v5-style UUID (version 5, variant 10xx).
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
