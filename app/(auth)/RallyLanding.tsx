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

const HOW = [
  ["Ask the Collective or one CRO", "Every CRO is an AI built on a real operator's documented expertise. The Collective brings them together."],
  ["Talk it through", "Type or speak. Rally asks only what it needs and remembers your company."],
  ["Leave with a decision", "A clear recommendation, where CROs agree or differ, and next steps you can commit to."],
] as const;

/** How Rally works, behind one click (progressive disclosure: the page leads with one action). */
function HowRallyWorks() {
  return (
    <details className="group/how max-w-xl">
      <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "#C8D3E0" }}>
        How Rally works <span aria-hidden className="transition-transform group-open/how:rotate-90">›</span>
      </summary>
      <ol className="mt-4 space-y-3">
        {HOW.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span aria-hidden className="flex h-6 w-6 min-w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: "rgba(61,220,151,0.15)", color: "#3DDC97" }}>{i + 1}</span>
            <span>
              <span className="block font-semibold text-white">{t}</span>
              <span className="block text-sm" style={{ color: "#B7C5D4" }}>{d}</span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * The Rally landing page (simplified Nov 25, 2026, after Ben Carcio's walkthrough), on /sign-in and
 * /sign-up: "Meet your CRO collective", the CROs in it, and one action, Get Access to Rally (a magic
 * link, then the short company step, then the first conversation). How it works is one click away. "Ask Rally a question first" opens the website chat (open
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
        <div className="space-y-8">
          <div className="flex items-center gap-10">
            <div className="space-y-6 min-w-0 flex-1">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[clamp(2.25rem,3vw,3.75rem)] font-normal leading-[1.02] text-white" style={{ letterSpacing: "-0.015em" }}>
                Meet your <em style={{ color: "#3DDC97" }}>CRO collective.</em>
              </h1>
              <p className="text-lg max-w-lg" style={{ color: "#C8D3E0" }}>{RALLY.promise}</p>
              {cros.length > 0 && (
                <ul aria-label="The CROs in Rally" className="flex flex-wrap gap-x-5 gap-y-3">
                  {cros.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5">
                      <CroFace name={c.name} photoUrl={c.photoUrl} size={40} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{c.name}</span>
                        {c.title && <span className="block text-xs truncate max-w-[14rem]" style={{ color: "#8FA3B8" }}>{c.title}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Phones and tablets: a "Watch" row that opens the video in place. */}
              <div className="lg:hidden">
                <IntroVideo compact photoUrl={introPhoto} />
              </div>
              <HowRallyWorks />
            </div>
            <div className="hidden lg:block">
              <IntroVideo photoUrl={introPhoto} />
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        <section aria-label="Get access to Rally" className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Try Rally free</h2>
            <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>Enter your email to create your account. Free while Rally is in Beta.</p>
          </div>
          <MagicLinkForm mode="sign-up" next="/claim" cta={RALLY.cta} switchLink={false} />
        </section>
        <details open={chatting} className="group/ask rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <summary className="cursor-pointer list-none flex items-center justify-between text-base font-semibold" style={{ color: "var(--foreground)" }}>
            <span>Or ask a question first</span>
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
