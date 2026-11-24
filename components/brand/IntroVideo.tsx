"use client";

import { Play } from "lucide-react";
import { useRef, useState } from "react";
import { RallyMark } from "./Rally";

import { INTRO_VIDEO } from "./intro";

/**
 * The Rally intro video on the landing page (Nov 24, 2026). Before it plays, a designed cover rather
 * than a frame of the video: the CRO's own profile photo in a glowing ring on Rally's navy, their name
 * and role, what the video is about, and the play button. It plays with sound only when tapped, and
 * the cover comes back when it ends. `compact` (phones): a "Watch" row that opens it in place.
 */
export function IntroVideo({ compact = false, photoUrl = null }: { compact?: boolean; photoUrl?: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [open, setOpen] = useState(!compact);
  const first = INTRO_VIDEO.who.split(" ")[0];
  const label = `Watch ${first}'s intro to Rally (${INTRO_VIDEO.length})`;
  const play = () => {
    setOpen(true);
    setStarted(true);
    setPlaying(true);
    requestAnimationFrame(() => video.current?.play().catch(() => setPlaying(false)));
  };
  const face = (size: number) =>
    photoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
    ) : (
      <span className="rounded-full flex items-center justify-center font-semibold text-white" style={{ width: size, height: size, background: "var(--green)", fontSize: size * 0.34 }}>
        {INTRO_VIDEO.who.split(" ").map((w) => w[0]).join("")}
      </span>
    );
  if (!open)
    return (
      <button type="button" onClick={play} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2A4157" }}>
        <span className="relative shrink-0">
          {face(40)}
          <span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--green)", boxShadow: "0 0 0 2px #0D1B2A" }}>
            <Play size={10} fill="#fff" color="#fff" aria-hidden />
          </span>
        </span>
        <span className="text-sm text-white font-semibold">{label}</span>
      </button>
    );
  return (
    <figure className={compact ? "w-[220px] max-w-full" : "w-[190px] xl:w-[220px] 2xl:w-[250px] shrink-0"}>
      <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "9 / 16", background: "#000", boxShadow: "0 0 0 1px #2A4157, 0 24px 48px -12px rgba(0,0,0,0.6)" }}>
        <video
          ref={video}
          src={INTRO_VIDEO.src}
          preload="metadata"
          playsInline
          controls={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setStarted(false);
          }}
          className="absolute inset-0 w-full h-full object-cover"
          aria-label={label}
        />
        {!started && (
          <button
            type="button"
            onClick={play}
            aria-label={label}
            className="group absolute inset-0 flex flex-col items-center text-center px-4 pt-5 pb-5"
            style={{ background: "radial-gradient(120% 70% at 50% 30%, #17402F 0%, #12263A 45%, #0D1B2A 100%)" }}
          >
            <span className="flex items-center gap-1.5 self-start">
              <RallyMark size={18} />
              <span className="text-xs font-semibold text-white tracking-tight">Rally</span>
            </span>
            <span className="relative mt-auto">
              <span aria-hidden className="absolute -inset-4 rounded-full blur-xl" style={{ background: "radial-gradient(circle, rgba(61,220,151,0.45), transparent 70%)" }} />
              <span className="relative block rounded-full p-[3px]" style={{ background: "linear-gradient(135deg, #3DDC97, #1A7049 60%, #0E3F2A)" }}>
                <span className="block rounded-full p-[3px]" style={{ background: "#0D1B2A" }}>
                  {face(110)}
                </span>
              </span>
            </span>
            <span className="mt-4 block font-semibold text-white text-base leading-tight">{INTRO_VIDEO.who}</span>
            <span className="block text-[11px] leading-snug mt-0.5" style={{ color: "#8FA3B8" }}>{INTRO_VIDEO.role}</span>
            <span className="mt-4 block font-display italic text-2xl leading-tight" style={{ color: "#3DDC97" }}>{INTRO_VIDEO.title}</span>
            <span className="mt-auto flex items-center gap-2">
              <span className="w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-105" style={{ background: "var(--green)", boxShadow: "0 0 0 6px rgba(21,90,60,0.35)" }}>
                <Play size={20} fill="#fff" color="#fff" aria-hidden />
              </span>
              <span className="text-xs font-semibold text-white">Watch · {INTRO_VIDEO.length}</span>
            </span>
          </button>
        )}
      </div>
    </figure>
  );
}
