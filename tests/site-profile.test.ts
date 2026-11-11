import { describe, expect, it } from "vitest";
import { isPrivateAddress, parseSiteProfile, siteUrl } from "@/lib/site-profile";

describe("siteUrl", () => {
  it("accepts plain public addresses and adds https", () => {
    expect(siteUrl("fastenhealth.com")?.toString()).toBe("https://fastenhealth.com/");
    expect(siteUrl(" https://www.acme.io/about ")?.hostname).toBe("www.acme.io");
  });
  it("refuses anything that isn't a public website", () => {
    for (const bad of ["", null, "localhost", "http://127.0.0.1", "http://[::1]/", "ftp://acme.com", "https://user:pw@acme.com", "https://acme.com:8080", "intranet", "printer.local", "db.internal"]) expect(siteUrl(bad), String(bad)).toBeNull();
  });
});

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and metadata ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["76.76.21.21", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("parseSiteProfile", () => {
  const base = new URL("https://fastenhealth.com/");
  it("prefers the touch icon and the meta description, resolving relative links", () => {
    const html = `<html><head><title>Fasten</title>
      <link rel="icon" href="/favicon-32.png" sizes="32x32">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      <meta name="description" content="Fasten Health &amp; you: one place for all your medical records.">
      <meta property="og:description" content="Ignored when a description exists"></head></html>`;
    expect(parseSiteProfile(html, base)).toEqual({ logoUrl: "https://fastenhealth.com/apple-touch-icon.png", about: "Fasten Health & you: one place for all your medical records." });
  });
  it("falls back to og:description and /favicon.ico", () => {
    expect(parseSiteProfile(`<meta content='We sell widgets' property='og:description'>`, base)).toEqual({ logoUrl: "https://fastenhealth.com/favicon.ico", about: "We sell widgets" });
  });
  it("ignores non-web icon links", () => {
    expect(parseSiteProfile(`<link rel="icon" href="javascript:alert(1)">`, base).logoUrl).toBeNull();
  });
});
