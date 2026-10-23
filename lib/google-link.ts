/**
 * Google links founders paste instead of uploading. We never fetch the URL
 * they give us: we read the file id from it and build Google's own export
 * URL, so only Google hosts are ever contacted.
 */

export type GoogleLink = {
  kind: "sheet" | "doc" | "slides" | "drive";
  id: string;
  exportUrl: string;
  /** Used when Google doesn't send a file name. */
  fallbackName: string;
};

const ID = "([a-zA-Z0-9_-]{10,})";

export function parseGoogleLink(raw: string): GoogleLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const short = (id: string) => id.slice(0, 8);
  if (url.hostname === "docs.google.com") {
    const m = url.pathname.match(new RegExp(`^/(spreadsheets|document|presentation)/d/${ID}`));
    if (!m) return null;
    const [, type, id] = m as unknown as [string, string, string];
    if (type === "spreadsheets") return { kind: "sheet", id, exportUrl: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, fallbackName: `Google Sheet ${short(id)}.xlsx` };
    if (type === "document") return { kind: "doc", id, exportUrl: `https://docs.google.com/document/d/${id}/export?format=pdf`, fallbackName: `Google Doc ${short(id)}.pdf` };
    return { kind: "slides", id, exportUrl: `https://docs.google.com/presentation/d/${id}/export/pdf`, fallbackName: `Google Slides ${short(id)}.pdf` };
  }
  if (url.hostname === "drive.google.com") {
    const m = url.pathname.match(new RegExp(`^/file/d/${ID}`));
    const id = m?.[1] ?? (url.pathname === "/open" || url.pathname === "/uc" ? url.searchParams.get("id") : null);
    if (!id || !new RegExp(`^${ID}$`).test(id)) return null;
    return { kind: "drive", id, exportUrl: `https://drive.google.com/uc?export=download&id=${id}`, fallbackName: `Google Drive file ${short(id)}` };
  }
  return null;
}

/** Hosts Google redirects exports to. Redirects anywhere else are refused. */
export function isGoogleHost(hostname: string): boolean {
  return (
    hostname === "docs.google.com" ||
    hostname === "drive.google.com" ||
    hostname === "drive.usercontent.google.com" ||
    hostname.endsWith(".googleusercontent.com")
  );
}

/** File name from a Content-Disposition header, if any. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=(?:UTF-8|utf-8)''([^;]+)/);
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/);
  return plain ? plain[1]!.trim() : null;
}

export const NOT_SHARED =
  "We couldn't open that link. In Google, set sharing to “Anyone with the link can view” and try again, or download the file and drop it above.";

export type FetchedFile = { bytes: Buffer; contentType: string; filename: string };

/**
 * Downloads a Google export, following redirects only within Google, with a
 * size cap and timeout. Throws with a founder-friendly message.
 */
export async function fetchGoogleExport(link: GoogleLink, maxBytes: number, fetchImpl: typeof fetch = fetch): Promise<FetchedFile> {
  let url = link.exportUrl;
  let res: Response | null = null;
  for (let hop = 0; hop < 6; hop++) {
    res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { "user-agent": "GrowthGoaled/1.0" } });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error(NOT_SHARED);
      const target = new URL(next, url);
      if (target.protocol !== "https:" || !isGoogleHost(target.hostname)) throw new Error(NOT_SHARED);
      // Google sends unshared files to the sign-in page.
      if (target.hostname === "accounts.google.com") throw new Error(NOT_SHARED);
      url = target.toString();
      continue;
    }
    break;
  }
  if (!res || res.status === 401 || res.status === 403 || res.status === 404) throw new Error(NOT_SHARED);
  if (!res.ok) throw new Error(`Google returned an error (${res.status}). Try again in a minute.`);
  const contentType = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0]!.trim();
  // An HTML page instead of a file means a sign-in page or a large-file warning.
  if (contentType === "text/html") throw new Error(NOT_SHARED);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("That file is over 25 MB. Download it and split or compress it.");

  const reader = res.body?.getReader();
  if (!reader) throw new Error(NOT_SHARED);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("That file is over 25 MB. Download it and split or compress it.");
    }
    chunks.push(value);
  }
  if (!size) throw new Error("That file is empty.");
  const name = filenameFromDisposition(res.headers.get("content-disposition")) ?? link.fallbackName;
  return { bytes: Buffer.concat(chunks), contentType, filename: name.replace(/[/\\]/g, "_").slice(0, 200) };
}
