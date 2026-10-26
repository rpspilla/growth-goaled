import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";

export default async function ProgressPage() {
  const { active } = await founderContext();
  if (!active) redirect("/library");
  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow={active.def.shortTitle} title="Progress & Tracking" subtitle="Your KPIs from baseline to target, your plan's actions and monthly check-ins." />
      <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
        Tracking starts once your advisor approves your baseline. You&apos;ll see each KPI&apos;s progress toward your target here.
      </div>
    </div>
  );
}
