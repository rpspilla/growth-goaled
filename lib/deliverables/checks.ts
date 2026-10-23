/**
 * Code-level QA for drafts (independent of the QA model): every number in the
 * text must match a value the Draft Agent was given (or a simple gap between
 * two of them), and every claim must cite at least one of the IDs it was given.
 */

export type NumberToken = { raw: string; value: number; percent: boolean };

const TOKEN = /(\$)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(k|m|bn|b)(?![a-z]))?\s*(%|x(?![a-z])|days?(?![a-z])|d(?![a-z])|mo(?![a-z])|months?(?![a-z])|pp(?![a-z])|points?(?![a-z]))?/gi;

/** Numbers mentioned in text, normalised ($1.2M → 1200000, 72% → 72). */
export function numbersIn(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const [raw, dollar, digits, scale, unit] = m;
    let value = Number(digits!.replace(/,/g, ""));
    const s = scale?.toLowerCase();
    if (s === "k") value *= 1_000;
    else if (s === "m") value *= 1_000_000;
    else if (s === "b" || s === "bn") value *= 1_000_000_000;
    const hasUnit = Boolean(dollar || s || unit);
    // Bare years ("Q3 2026", "FY2025") and small counts ("3 areas") aren't metric claims.
    if (!hasUnit && value >= 1990 && value <= 2100 && Number.isInteger(value)) continue;
    if (!hasUnit && value <= 12 && Number.isInteger(value)) continue;
    // Part of a word or version/identifier, e.g. "Q3" or "n=14" is handled as a count below.
    const before = text[m.index! - 1];
    if (before && /[A-Za-z_]/.test(before)) continue;
    out.push({ raw: raw.trim(), value, percent: unit === "%" || unit?.toLowerCase().startsWith("p") === true });
  }
  return out;
}

/** True when `n` is (a rounded form of) one of the allowed values. */
export function matchesAllowed(n: number, allowed: number[]): boolean {
  return allowed.some((v) => {
    const tol = Math.max(Math.abs(v) * 0.02, Math.abs(v) >= 1000 ? Math.abs(v) * 0.05 : 0.51);
    return Math.abs(n - v) <= tol;
  });
}

export type ComparisonValues = { company: number; median: number | null; topQuartile: number | null; p25: number | null };

/** Every figure the draft may state: inputs, and simple gaps between a company value and its benchmarks. */
export function allowedNumbers(rows: ComparisonValues[], extra: number[]): number[] {
  const out = [...extra];
  for (const r of rows) {
    const bench = [r.median, r.topQuartile, r.p25].filter((v): v is number => v !== null);
    out.push(r.company, ...bench);
    for (const b of bench) {
      out.push(Math.abs(r.company - b));
      if (b !== 0) out.push(Math.abs(Math.round(((r.company - b) / b) * 1000) / 10));
    }
  }
  return out;
}

export type ClaimForCheck = { key: string; text: string; sources: string[] };

export type CodeCheckResult = {
  untracedNumbers: { claim: string; raw: string }[];
  unsourcedClaims: string[];
  unknownSources: { claim: string; id: string }[];
};

export function checkDraft(claims: ClaimForCheck[], allowed: number[], validSourceIds: Set<string>): CodeCheckResult {
  const result: CodeCheckResult = { untracedNumbers: [], unsourcedClaims: [], unknownSources: [] };
  for (const c of claims) {
    for (const t of numbersIn(c.text)) if (!matchesAllowed(t.value, allowed)) result.untracedNumbers.push({ claim: c.key, raw: t.raw });
    const known = c.sources.filter((id) => validSourceIds.has(id));
    for (const id of c.sources) if (!validSourceIds.has(id)) result.unknownSources.push({ claim: c.key, id });
    if (known.length === 0) result.unsourcedClaims.push(c.key);
  }
  return result;
}
