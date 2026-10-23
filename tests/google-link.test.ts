import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchGoogleExport, filenameFromDisposition, isGoogleHost, NOT_SHARED, parseGoogleLink } from "@/lib/google-link";
import { apiKeyProblem } from "@/lib/ai/config";

const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

describe("parseGoogleLink", () => {
  it("builds Google's own export URLs", () => {
    expect(parseGoogleLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toMatchObject({ kind: "sheet", exportUrl: `https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx` });
    expect(parseGoogleLink(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`)).toMatchObject({ kind: "doc", exportUrl: `https://docs.google.com/document/d/${ID}/export?format=pdf` });
    expect(parseGoogleLink(`https://docs.google.com/presentation/d/${ID}/edit`)).toMatchObject({ kind: "slides", exportUrl: `https://docs.google.com/presentation/d/${ID}/export/pdf` });
    expect(parseGoogleLink(`https://drive.google.com/file/d/${ID}/view?usp=drive_link`)).toMatchObject({ kind: "drive", exportUrl: `https://drive.google.com/uc?export=download&id=${ID}` });
    expect(parseGoogleLink(`https://drive.google.com/open?id=${ID}`)?.kind).toBe("drive");
  });
  it("rejects anything that isn't a Google file link", () => {
    for (const bad of ["not a url", "http://docs.google.com/spreadsheets/d/abcdefghijkl", "https://evil.com/spreadsheets/d/abcdefghijkl", "https://docs.google.com/forms/d/abcdefghijkl", "https://drive.google.com/drive/folders/abcdefghijkl", "https://docs.google.com.evil.com/spreadsheets/d/abcdefghijkl"]) {
      expect(parseGoogleLink(bad), bad).toBeNull();
    }
  });
});

describe("helpers", () => {
  it("allows only Google download hosts", () => {
    expect(isGoogleHost("doc-0s-4c-sheets.googleusercontent.com")).toBe(true);
    expect(isGoogleHost("drive.usercontent.google.com")).toBe(true);
    expect(isGoogleHost("googleusercontent.com.evil.com")).toBe(false);
    expect(isGoogleHost("accounts.google.com")).toBe(false);
  });
  it("reads file names from Content-Disposition", () => {
    expect(filenameFromDisposition(`attachment; filename="Model.xlsx"; filename*=UTF-8''Q3%20Model%20%E2%80%93%20v2.xlsx`)).toBe("Q3 Model – v2.xlsx");
    expect(filenameFromDisposition('attachment; filename="Board deck.pdf"')).toBe("Board deck.pdf");
    expect(filenameFromDisposition(null)).toBeNull();
  });
});

const respond = (body: string | null, init: { status?: number; headers?: Record<string, string> }) => new Response(body, { status: init.status ?? 200, headers: init.headers });

describe("fetchGoogleExport", () => {
  const link = parseGoogleLink(`https://docs.google.com/spreadsheets/d/${ID}/edit`)!;

  it("follows Google's redirect and returns the file", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return calls.length === 1
        ? respond(null, { status: 307, headers: { location: "https://doc-0s-sheets.googleusercontent.com/export/abc" } })
        : respond("PKfakexlsx", { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="Everything.xlsx"' } });
    }) as unknown as typeof fetch;
    const f = await fetchGoogleExport(link, 1000, fake);
    expect(calls[0]).toBe(link.exportUrl);
    expect(f).toMatchObject({ filename: "Everything.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(f.bytes.toString()).toBe("PKfakexlsx");
  });

  it("explains unshared files (sign-in redirect, 401/403, or an HTML page)", async () => {
    const signIn = (async () => respond(null, { status: 302, headers: { location: "https://accounts.google.com/ServiceLogin?continue=x" } })) as unknown as typeof fetch;
    await expect(fetchGoogleExport(link, 1000, signIn)).rejects.toThrow(NOT_SHARED);
    const forbidden = (async () => respond("no", { status: 403 })) as unknown as typeof fetch;
    await expect(fetchGoogleExport(link, 1000, forbidden)).rejects.toThrow(NOT_SHARED);
    const html = (async () => respond("<html>", { headers: { "content-type": "text/html; charset=utf-8" } })) as unknown as typeof fetch;
    await expect(fetchGoogleExport(link, 1000, html)).rejects.toThrow(NOT_SHARED);
  });

  it("never follows a redirect off Google", async () => {
    const fake = vi.fn(async () => respond(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    await expect(fetchGoogleExport(link, 1000, fake as unknown as typeof fetch)).rejects.toThrow(NOT_SHARED);
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("enforces the size limit", async () => {
    const declared = (async () => respond("x", { headers: { "content-type": "text/csv", "content-length": "5000" } })) as unknown as typeof fetch;
    await expect(fetchGoogleExport(link, 1000, declared)).rejects.toThrow(/over 25 MB/);
    const streamed = (async () => respond("x".repeat(2000), { headers: { "content-type": "text/csv" } })) as unknown as typeof fetch;
    await expect(fetchGoogleExport(link, 1000, streamed)).rejects.toThrow(/over 25 MB/);
  });
});

describe("apiKeyProblem", () => {
  const real = `sk-ant-api03-${"a".repeat(90)}`;
  it("accepts a full key and tolerates surrounding whitespace", () => {
    expect(apiKeyProblem(real)).toBeNull();
    expect(apiKeyProblem(`  ${real}\n`)).toBeNull();
  });
  it("flags missing, shortened, mistyped and short keys without echoing them", () => {
    expect(apiKeyProblem(undefined)).toMatch(/isn't set/);
    const shortened = apiKeyProblem("sk-ant-api03-abcdef…wxyz")!;
    expect(shortened).toMatch(/shortened form/);
    expect(shortened).not.toContain("abcdef");
    expect(apiKeyProblem(`sk-ant-api03 ${"a".repeat(40)}`)).toMatch(/shortened form/);
    expect(apiKeyProblem(`sk-proj-${"a".repeat(60)}`)).toMatch(/start with sk-ant-/);
    expect(apiKeyProblem("sk-ant-abc")).toMatch(/too short/);
  });
});
