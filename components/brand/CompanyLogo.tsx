"use client";

import { useState } from "react";

/** The company's logo from its website, or its initial when there isn't one (or it won't load). */
export function CompanyLogo({ name, src, size = 56 }: { name: string; src: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src || failed)
    return (
      <span className="rounded-2xl flex items-center justify-center font-bold shrink-0" style={{ ...box, background: "var(--green-muted)", color: "var(--green)", fontSize: size * 0.42 }} aria-hidden>
        {name[0]?.toUpperCase()}
      </span>
    );
  return (
    // A remote favicon or touch icon of unknown size: a plain img, contained in a white tile.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${name} logo`} onError={() => setFailed(true)} referrerPolicy="no-referrer" className="rounded-2xl object-contain p-1.5 shrink-0" style={{ ...box, background: "#fff", border: "1px solid var(--border)" }} />
  );
}
