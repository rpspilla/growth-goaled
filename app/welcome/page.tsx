import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/access";
import { needsOnboarding } from "@/lib/onboarding";
import { getFounderCompany } from "@/lib/data/companies";
import { track } from "@/lib/events";
import { AuthShell, Points } from "../(auth)/AuthShell";
import { WelcomeForm } from "./WelcomeForm";

export const metadata: Metadata = { title: "Set up your company · Growth Goaled" };

/** First sign-in: founders set up their company (step 2 of 3); advisors and invited founders confirm their profile. */
export default async function WelcomePage() {
  const user = await requireUser({ allowIncomplete: true });
  if (!needsOnboarding(user)) redirect(homePathFor(user.role));
  const isFounder = user.role === "founder";
  // Invited founders already have a company, so they only complete their profile.
  const company = isFounder ? await getFounderCompany(user) : null;
  const askCompany = isFounder && !company;
  await track("welcome_viewed", { userId: user.id, props: { role: user.role, new_company: askCompany } });

  return (
    <AuthShell
      brand={
        askCompany ? (
          <>
            <div className="text-sm font-semibold mb-4" style={{ color: "#3DDC97" }}>Step 2 of 3 · Your company</div>
            <h1 className="font-display text-4xl sm:text-5xl font-normal leading-[1.08] text-white">Two quick details, then your first growth question.</h1>
            <p className="text-lg mt-5 mb-8" style={{ color: "#B7C5D4" }}>We use your revenue range to suggest the right questions for your stage. Everything else can wait until it&apos;s needed.</p>
            <Points items={["Next: pick the growth question you want answered", "Then: a few questions and your free Growth Snapshot", "Nothing is charged unless you choose a full assessment"]} />
          </>
        ) : (
          <>
            <div className="text-sm font-semibold mb-4" style={{ color: "#3DDC97" }}>{isFounder ? "Welcome" : user.role === "admin" ? "Admin" : "Advisor"}</div>
            <h1 className="font-display text-4xl sm:text-5xl font-normal leading-[1.08] text-white">{company ? `Welcome to ${company.name}.` : "Welcome to Growth Goaled."}</h1>
            <p className="text-lg mt-5" style={{ color: "#B7C5D4" }}>{isFounder ? "Confirm your name and you're in." : "Tell founders who's reviewing their analysis."}</p>
          </>
        )
      }
    >
      <h2 className="text-2xl sm:text-3xl font-semibold" style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}>{askCompany ? "Set up your company" : "Your profile"}</h2>
      <p className="text-base mt-2 mb-6" style={{ color: "var(--muted-foreground)" }}>{askCompany ? "Takes about a minute." : "One step and you're in."}</p>
      <WelcomeForm isFounder={isFounder} askCompany={askCompany} defaultName={user.name ?? ""} />
    </AuthShell>
  );
}
