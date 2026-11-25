/**
 * Who the founder is talking to in Rally (Rally Beta, Nov 24, 2026): the CRO's real photo (or their
 * initials, never a stand-in), name, title, credibility line, two or three areas of expertise, and
 * that the answers are powered by their documented experience and judgment. For the Growth Goaled
 * Collective, the faces of the CROs in it. Nothing here is invented: missing fields are left out.
 */
export type CroCard = { id: string; name: string; slug: string; title: string | null; headline: string | null; expertise: string[]; photoUrl: string | null };

const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
// Expertise tags are stored lower-case; show them the way people write them.
const ACRONYMS: Record<string, string> = { b2b: "B2B", b2c: "B2C", saas: "SaaS", gtm: "GTM", icp: "ICP", arr: "ARR", mrr: "MRR", nrr: "NRR", revops: "RevOps", ai: "AI", plg: "PLG", sdr: "SDR", ae: "AE", aes: "AEs", vp: "VP", cs: "CS", abm: "ABM" };
export const cap = (s: string) => {
  const words = s.split(" ").map((w) => ACRONYMS[w.toLowerCase()] ?? w);
  const first = words[0] ?? "";
  if (first && !ACRONYMS[first.toLowerCase()]) words[0] = first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(" ");
};

export function Face({ name, photoUrl, size = 52 }: { name: string; photoUrl: string | null; size?: number }) {
  const style = { width: size, height: size, minWidth: size, boxShadow: "0 0 0 2px var(--card), 0 0 0 3px var(--border)" };
  return photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl} alt={`${name}`} className="rounded-full object-cover" style={style} />
  ) : (
    <span role="img" aria-label={name} className="rounded-full flex items-center justify-center font-semibold" style={{ ...style, background: "var(--green-muted)", color: "var(--green)", fontSize: Math.round(size * 0.34) }}>
      {initialsOf(name)}
    </span>
  );
}

export function Faces({ cros, size }: { cros: CroCard[]; size: number }) {
  const shown = cros.slice(0, 3);
  return (
    <span className="flex shrink-0" aria-hidden>
      {shown.map((c, i) => (
        <span key={c.id} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Face name={c.name} photoUrl={c.photoUrl} size={size} />
        </span>
      ))}
      {cros.length > shown.length && (
        <span className="rounded-full flex items-center justify-center text-xs font-semibold text-white" style={{ width: size, height: size, marginLeft: -size * 0.3, background: "var(--green)", boxShadow: "0 0 0 2px var(--card)" }}>
          +{cros.length - shown.length}
        </span>
      )}
      {!shown.length && (
        <span className="rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ width: size, height: size, background: "var(--green)" }}>R</span>
      )}
    </span>
  );
}

/** size "lg" on the entry screen (with the credibility line); "sm" as the pinned conversation header. */
export function CroIdentity({ cro, collective, size = "sm", action }: { cro: CroCard | null; collective: CroCard[]; size?: "lg" | "sm"; action?: React.ReactNode }) {
  const lg = size === "lg";
  const first = cro?.name.split(" ")[0];
  return (
    <div className={`flex flex-wrap items-center ${lg ? "gap-x-5 gap-y-3" : "gap-3"} min-w-0`} aria-label={cro ? `Talking with ${cro.name}'s AI CRO` : "Talking with the Rally Collective"} role="group">
      {cro ? <Face name={cro.name} photoUrl={cro.photoUrl} size={lg ? 84 : 48} /> : <Faces cros={collective} size={lg ? 56 : 36} />}
      <div className="min-w-[12rem] flex-1 space-y-1">
        <div className="flex items-baseline gap-x-2 flex-wrap">
          <span className={`font-semibold ${lg ? "text-lg" : "text-base"}`} style={{ color: "var(--foreground)" }}>{cro ? cro.name : "Rally Collective"}</span>
          {cro?.title && <span className="text-sm hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>{cro.title}</span>}
          {!cro && <span className="text-sm hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>{collective.length > 1 ? `The combined judgment of ${collective.length} CROs` : "Experienced operators. Different perspectives."}</span>}
        </div>
        {lg && cro?.headline && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{cro.headline}</p>}
        {cro && cro.expertise.length > 0 && (
          <ul className={`flex gap-1.5 flex-wrap ${lg ? "" : "hidden sm:flex"}`} aria-label="Expertise">
            {cro.expertise.slice(0, 3).map((e) => (
              <li key={e} className="text-xs rounded-full px-2 py-0.5 border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>{cap(e)}</li>
            ))}
          </ul>
        )}
        {lg && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {cro ? `Powered by ${first}'s CRO experience and judgment. An AI built on ${first}'s documented expertise, not ${first} in person.` : "Powered by the experience and judgment of the CROs in the Rally Collective, combined into one recommendation."}
          </p>
        )}
      </div>
      {action && <div className="w-full sm:w-auto sm:self-start">{action}</div>}
    </div>
  );
}

export const toCroCard = (c: { id: string; name: string; slug: string; title: string | null; headline: string | null; expertise: string[]; photoUrl: string | null }): CroCard => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  title: c.title,
  headline: c.headline,
  expertise: c.expertise,
  photoUrl: c.photoUrl,
});
