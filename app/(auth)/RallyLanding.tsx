import { cookies } from "next/headers";
import { RALLY } from "@/components/brand/Rally";
import { IntroVideo } from "@/components/brand/IntroVideo";
import { INTRO_VIDEO } from "@/components/brand/intro";
import { listCroProfiles } from "@/lib/data/cro";
import { GUEST_COOKIE, guestByToken } from "@/lib/data/guest";
import { AuthShell } from "./AuthShell";
import { GuestEntry } from "./GuestEntry";
import { MagicLinkForm } from "./MagicLinkForm";
import { ReturningSignIn } from "./ReturningSignIn";

/** A published CRO's face (their uploaded photo, or initials), never a stand-in picture. */
export function CroFace({ name, photoUrl, size = 48, ring = "#152638" }: { name: string; photoUrl: string | null; size?: number; ring?: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const style = { width: size, height: size, minWidth: size, boxShadow: `0 0 0 2px ${ring}` };
  return photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl} alt="" className="rounded-full object-cover" style={style} />
  ) : (
    <span aria-hidden className="rounded-full flex items-center justify-center font-semibold" style={{ ...style, background: "var(--green-muted)", color: "var(--green)", fontSize: size * 0.34 }}>{initials}</span>
  );
}

/**
 * The Rally landing page (Rally Beta, Nov 24, 2026), on /sign-in and /sign-up: what Rally is, the
 * real CROs behind it, and one action, Get Free Beta Access (a magic link, then the short company
 * step, then the first conversation). "Ask Rally a question first" opens the website chat (open
 * already when one is under way, or when arriving from a CRO's public page).
 */
export async function RallyLanding({ cro }: { cro?: string }) {
  const [cros, guest] = await Promise.all([listCroProfiles({ published: true }), guestByToken((await cookies()).get(GUEST_COOKIE)?.value)]);
  // The video's cover uses the speaker's own (published) profile photo.
  const introPhoto = cros.find((c) => c.name === INTRO_VIDEO.who)?.photoUrl ?? null;
  const chatting = Boolean(cro) || Boolean(guest && !guest.claimedAt && guest.messages.some((m) => m.role === "user"));
  return (
    <AuthShell
      wide
      brand={
        <div className="flex items-center gap-10">
          <div className="space-y-7 min-w-0 flex-1">
            <div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[clamp(2.25rem,3vw,3.75rem)] font-normal leading-[1.02] text-white" style={{ letterSpacing: "-0.015em" }}>
                Your CRO.<br />
                <em style={{ color: "#3DDC97" }}>Ready when you are.</em>
              </h1>
              <p className="text-lg mt-5 max-w-lg" style={{ color: "#C8D3E0" }}>{RALLY.landing}</p>
            </div>
            {/* Phones and tablets: a "Watch" row that opens the video in place. */}
            <div className="lg:hidden">
              <IntroVideo compact photoUrl={introPhoto} />
            </div>
            {cros.length > 0 && (
              <div className="hidden sm:block space-y-3" aria-label="The CROs behind Rally">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8FA3B8" }}>The CROs behind Rally</div>
                <ul className="space-y-2.5">
                  {cros.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <CroFace name={c.name} photoUrl={c.photoUrl} size={44} />
                      <span className="min-w-0">
                        <span className="block font-semibold text-white">{c.name}</span>
                        {(c.title || c.headline) && <span className="block text-sm truncate" style={{ color: "#8FA3B8" }}>{c.title || c.headline}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm max-w-lg" style={{ color: "#8FA3B8" }}>{RALLY.transparency}</p>
              </div>
            )}
          </div>
          <div className="hidden lg:block">
            <IntroVideo photoUrl={introPhoto} />
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        <section aria-label="Get free Beta access" className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Get early access to Rally</h2>
            <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>
              Free during Beta. Help shape the next generation of CRO support for founders: get free access to Rally, explore expert CRO intelligence, and help us make it better.
            </p>
          </div>
          <MagicLinkForm mode="sign-up" next="/claim" cta="Get Free Beta Access" switchLink={false} />
        </section>
        <details open={chatting} className="group/ask rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <summary className="cursor-pointer list-none flex items-center justify-between text-base font-semibold" style={{ color: "var(--foreground)" }}>
            <span>Or ask Rally a question first <span className="font-normal text-sm" style={{ color: "var(--muted-foreground)" }}>· type or talk</span></span>
            <span aria-hidden className="transition-transform group-open/ask:rotate-90" style={{ color: "var(--muted-foreground)" }}>›</span>
          </summary>
          <div className="pt-4">
            <GuestEntry cro={cro} />
          </div>
        </details>
        <ReturningSignIn title="Log in to Rally" />
      </div>
    </AuthShell>
  );
}
