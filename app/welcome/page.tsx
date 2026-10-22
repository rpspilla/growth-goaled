import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/access";
import { needsOnboarding } from "@/lib/onboarding";
import { StagingBadge } from "@/components/shell/Shell";
import { WelcomeForm } from "./WelcomeForm";

export const metadata: Metadata = { title: "Welcome · Growth Goaled" };

/** First-sign-in form: profile for everyone, plus company basics for founders. */
export default async function WelcomePage() {
  const user = await requireUser({ allowIncomplete: true });
  if (!needsOnboarding(user)) redirect(homePathFor(user.role));
  const isFounder = user.role === "founder";

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-8 py-16 overflow-hidden" style={{ background: "var(--navy)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(21,90,60,0.18) 0%, transparent 70%)" }}
      />
      <div className="absolute top-6 left-6 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold" style={{ background: "var(--green)", color: "#fff" }}>
          G
        </div>
        <span className="font-semibold text-white text-sm tracking-tight">Growth Goaled</span>
        <StagingBadge />
      </div>

      <div className="relative w-full max-w-lg" style={{ animation: "fadeInUp 0.4s ease-out" }}>
        <div
          className="mx-auto mb-6 w-fit inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "rgba(21,90,60,0.3)", color: "#6EE7A8", border: "1px solid rgba(21,90,60,0.5)" }}
        >
          {isFounder ? "Growth Intelligence Platform" : user.role === "admin" ? "Admin" : "Advisor"}
        </div>
        <h1 className="font-display text-4xl font-normal mb-3 leading-tight text-center" style={{ color: "#FFFFFF" }}>
          {isFounder ? (
            <>
              Let&apos;s understand
              <br />
              <em>your growth engine.</em>
            </>
          ) : (
            <>
              Welcome to <em>Growth Goaled.</em>
            </>
          )}
        </h1>
        <p className="text-sm mb-8 text-center" style={{ color: "#7A98B4" }}>
          {isFounder
            ? "A few details about you and your company to set up your profile."
            : "Tell founders who's reviewing their analysis."}
        </p>
        <div className="rounded-xl p-6" style={{ background: "var(--card)" }}>
          <WelcomeForm isFounder={isFounder} defaultName={user.name ?? ""} />
        </div>
      </div>
    </div>
  );
}
