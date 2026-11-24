"use client";

import { Play } from "lucide-react";
import { useRef, useState } from "react";

export const INTRO_VIDEO = { src: "/rally/intro.mp4", poster: "/rally/intro-poster.jpg?v=2", length: "0:58", who: "Ryan Spillane", role: "Cofounding CRO, Growth Goaled" };

/**
 * The Rally intro video on the landing page (Nov 24, 2026): a phone-shaped card with its poster and
 * a play button; it plays with sound only when tapped. `compact` (phones): a "Watch" row that opens it.
 */
export function IntroVideo({ compact = false }: { compact?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(!compact);
  const label = `Watch ${INTRO_VIDEO.who.split(" ")[0]}'s intro to Rally (${INTRO_VIDEO.length})`;
  const play = () => {
    setOpen(true);
    setPlaying(true);
    requestAnimationFrame(() => video.current?.play().catch(() => setPlaying(false)));
  };
  if (!open)
    return (
      <button type="button" onClick={play} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2A4157" }}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--green)" }}>
          <Play size={16} fill="#fff" color="#fff" aria-hidden />
        </span>
        <span className="text-sm text-white font-semibold">{label}</span>
      </button>
    );
  return (
    <figure className={compact ? "w-[220px] max-w-full" : "w-[190px] xl:w-[220px] 2xl:w-[250px] shrink-0"}>
      <div className="relative rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: "9 / 16", background: "#000", boxShadow: "0 0 0 1px #2A4157, 0 24px 48px -12px rgba(0,0,0,0.6)" }}>
        <video
          ref={video}
          src={INTRO_VIDEO.src}
          poster={INTRO_VIDEO.poster}
          preload="metadata"
          playsInline
          controls={playing}
          onPlay={() => setPlaying(true)}
          onEnded={() => setPlaying(false)}
          className="absolute inset-0 w-full h-full object-cover"
          aria-label={label}
        />
        {!playing && (
          <button type="button" onClick={play} aria-label={label} className="absolute inset-0 flex flex-col items-center justify-end gap-2 pb-5" style={{ background: "linear-gradient(to top, rgba(13,27,42,0.75), transparent 55%)" }}>
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--green)", boxShadow: "0 0 0 6px rgba(21,90,60,0.35)" }}>
              <Play size={22} fill="#fff" color="#fff" aria-hidden />
            </span>
            <span className="text-xs font-semibold text-white">Watch · {INTRO_VIDEO.length}</span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 text-xs leading-snug" style={{ color: "#8FA3B8" }}>
        <span className="text-white font-semibold">{INTRO_VIDEO.who}</span>
        <br />
        {INTRO_VIDEO.role}
      </figcaption>
    </figure>
  );
}
