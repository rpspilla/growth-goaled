import { PageHeader } from "./PageHeader";

/** Stand-in for screens built in a later milestone. */
export function Placeholder({ title, subtitle, milestone }: { title: string; subtitle?: string; milestone: string }) {
  return (
    <div className="p-8 max-w-4xl">
      <PageHeader title={title} subtitle={subtitle} />
      <div
        className="rounded-xl border p-6 text-sm"
        style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        This screen arrives in milestone <span className="font-mono font-semibold" style={{ color: "var(--foreground)" }}>{milestone}</span>.
      </div>
    </div>
  );
}
