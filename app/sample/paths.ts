/** App paths that exist in the read-only demo. */
export const SAMPLE_PATHS = ["/dashboard", "/benchmark"] as const;

/** Maps a founder app path to its /sample URL, or null if the demo doesn't include it. */
export function sampleHref(path: string): string | null {
  if (!(SAMPLE_PATHS as readonly string[]).includes(path)) return null;
  return path === "/dashboard" ? "/sample" : `/sample${path}`;
}
