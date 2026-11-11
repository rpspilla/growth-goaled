import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** What a company's own website says about it: its logo and a one-line description. */
export type SiteProfile = { logoUrl: string | null; about: string | null };

const MAX_HTML_BYTES = 600_000;
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

/** "acme.com", "https://acme.com/about" → "https://acme.com/" style URL, or null when it isn't a plain public web address. */
export function siteUrl(website: string | null | undefined): URL | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || isIP(host.replace(/^\[|\]$/g, "")) || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

/** True for loopback, private, link-local and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const attrs = (tag: string) => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
};

/** Reads the logo and description from a page's HTML (pure, for tests). Relative links resolve against `base`. */
export function parseSiteProfile(html: string, base: URL): SiteProfile {
  const head = html.slice(0, 200_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (key: string) => metas.find((a) => (a.name ?? a.property ?? "").toLowerCase() === key)?.content;
  const description = meta("description") ?? meta("og:description") ?? meta("twitter:description");
  const about = description ? decode(description).slice(0, 320) || null : null;

  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const size = (a: Record<string, string>) => Math.max(0, ...(a.sizes ?? "").split(/\s+/).map((s) => Number(s.split("x")[0]) || 0));
  const rank = (a: Record<string, string>) => {
    const rel = (a.rel ?? "").toLowerCase();
    if (rel.includes("apple-touch-icon")) return 3000 + size(a);
    if (/\bicon\b/.test(rel)) return (a.href?.toLowerCase().endsWith(".svg") ? 2500 : 1000) + size(a);
    return -1;
  };
  const icon = links.filter((a) => a.href && rank(a) >= 0).sort((x, y) => rank(y) - rank(x))[0];
  const href = icon?.href ?? meta("og:logo");
  let logoUrl: string | null = null;
  try {
    const u = new URL(decode(href ?? "/favicon.ico"), base);
    if (u.protocol === "https:" || u.protocol === "http:") logoUrl = u.toString();
  } catch {
    logoUrl = null;
  }
  return { logoUrl, about };
}

/** Fetches the home page (public addresses only, a few redirects, size and time capped) and reads its profile. */
export async function fetchSiteProfile(website: string): Promise<SiteProfile | null> {
  let url = siteUrl(website);
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return null;
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "Mozilla/5.0 (compatible; GrowthGoaledBot/1.0)", accept: "text/html" } }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      url = next ? siteUrl(new URL(next, url).toString()) : null;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});
    return parseSiteProfile(new TextDecoder().decode(Buffer.concat(chunks)), url);
  }
  return null;
}
