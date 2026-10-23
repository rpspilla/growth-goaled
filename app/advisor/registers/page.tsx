import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { NewItemForm } from "@/components/registers/NewItemForm";
import { QuestionCard } from "@/components/registers/QuestionCard";
import { ReopenButton } from "@/components/registers/ReopenButton";
import { requireRole } from "@/lib/auth/session";
import { listManagedCompanies } from "@/lib/data/companies";
import { listFilesByCompany, listRegisterItems } from "@/lib/data/registers";
import { REGISTER_TYPES, type RegisterType } from "@/lib/registers";
import { createItem, reopenItem, resolveAsAdvisor } from "./actions";

const STATUSES = ["open", "resolved", "unknown", "all"] as const;
type Status = (typeof STATUSES)[number];

export default async function RegistersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(["advisor", "admin"]);
  const params = await searchParams;
  const status: Status = STATUSES.includes(params.status as Status) ? (params.status as Status) : "open";
  const type = REGISTER_TYPES.some((t) => t.id === params.type) ? (params.type as RegisterType) : undefined;

  const companies = await listManagedCompanies(user);
  const scoped = params.company ? companies.filter((c) => c.id === params.company) : companies;
  const ids = scoped.map((c) => c.id);
  const [items, allOpen, files] = await Promise.all([
    listRegisterItems(ids, { status: status === "all" ? undefined : status, type }),
    listRegisterItems(ids, { status: "open" }),
    listFilesByCompany(ids),
  ]);
  const names = new Map(companies.map((c) => [c.id, c.name]));

  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { status, type, company: params.company, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "status" && v === "open")) q.set(k, v);
    const s = q.toString();
    return `/advisor/registers${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) => ({
    background: active ? "var(--foreground)" : "var(--muted)",
    color: active ? "var(--background)" : "var(--muted-foreground)",
  });

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title="Registers" subtitle="Open questions, conflicts and assumptions across your portfolio." />

      {companies.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          You don&apos;t manage any companies yet. Claim one from <Link href="/advisor/unassigned" style={{ color: "var(--green)" }}>Unassigned</Link>.
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-5 gap-2">
              {REGISTER_TYPES.map((t) => {
                const n = allOpen.filter((i) => i.type === t.id).length;
                return (
                  <Link key={t.id} href={href({ type: type === t.id ? undefined : t.id })} className="rounded-xl border p-3" style={{ background: "var(--card)", borderColor: type === t.id ? t.color : "var(--border)" }}>
                    <div className="font-mono text-xl font-semibold" style={{ color: n ? t.color : "var(--foreground)" }}>{n}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t.label}</div>
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {STATUSES.map((s) => (
                <Link key={s} href={href({ status: s })} className="text-xs px-3 py-1 rounded-full capitalize" style={chip(status === s)}>{s}</Link>
              ))}
              <span className="mx-2 h-4 border-l" style={{ borderColor: "var(--border)" }} />
              <Link href={href({ company: undefined })} className="text-xs px-3 py-1 rounded-full" style={chip(!params.company)}>All companies</Link>
              {companies.map((c) => (
                <Link key={c.id} href={href({ company: c.id })} className="text-xs px-3 py-1 rounded-full" style={chip(params.company === c.id)}>{c.name}</Link>
              ))}
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Nothing here.</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="space-y-1">
                  <QuestionCard item={item} files={files[item.companyId] ?? []} resolve={resolveAsAdvisor} companyName={names.get(item.companyId)} />
                  {item.status !== "open" && (
                    <div className="flex justify-end">
                      <ReopenButton itemId={item.id} reopen={reopenItem} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div>
            <NewItemForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} action={createItem} />
          </div>
        </div>
      )}
    </div>
  );
}
