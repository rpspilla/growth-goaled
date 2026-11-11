import { desc, eq, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { deleteUserAction, setUserRole } from "./actions";
import { DeleteUser } from "@/components/advisor/DeleteUser";

const ROLE_LABEL = { founder: "Founder", advisor: "Advisor", admin: "Admin" } as const;

export default async function UsersPage() {
  const admin = await requireRole(["admin"]);
  const [users, memberships, invited] = await Promise.all([
    db.select().from(schema.users).orderBy(desc(schema.users.createdAt)),
    db.select({ userId: schema.companyMembers.userId, companyId: schema.companyMembers.companyId, name: schema.companies.name }).from(schema.companyMembers).innerJoin(schema.companies, eq(schema.companies.id, schema.companyMembers.companyId)),
    db.select({ email: schema.invites.email, name: schema.companies.name }).from(schema.invites).innerJoin(schema.companies, eq(schema.companies.id, schema.invites.companyId)).where(isNull(schema.invites.acceptedAt)),
  ]);
  // Companies each person is the only member of (offered for deletion with them).
  const soleOf = (userId: string) => memberships.filter((m) => m.userId === userId && !memberships.some((o) => o.companyId === m.companyId && o.userId !== userId)).map((m) => m.name);
  // Every person with the company they belong to: their companies as founders, Growth Goaled for staff,
  // the company they were invited to while the invite is open.
  const companyOf = (u: (typeof users)[number]): { name: string; note?: string } => {
    if (u.role !== "founder") return { name: "Growth Goaled" };
    const names = memberships.filter((m) => m.userId === u.id).map((m) => m.name);
    if (names.length) return { name: names.join(", ") };
    const invite = invited.find((i) => i.email.toLowerCase() === u.email.toLowerCase());
    return invite ? { name: invite.name, note: "invited" } : { name: "No company yet", note: "missing" };
  };

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      <PageHeader
        title="Users"
        subtitle="Make someone an advisor or admin, or delete them. People appear after their first sign-in; everyone starts as a founder."
      />
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div
          className="grid grid-cols-12 px-5 py-3 border-b label"
          style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          <div className="col-span-3">Person</div>
          <div className="col-span-3">Company</div>
          <div className="col-span-2">Title</div>
          <div className="col-span-1">Profile</div>
          <div className="col-span-3">Role</div>
        </div>
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-12 items-center px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="col-span-3 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{u.name || "—"}</div>
              <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{u.email}</div>
            </div>
            <div className="col-span-3 min-w-0 text-sm truncate" style={{ color: companyOf(u).note === "missing" ? "var(--amber)" : "var(--foreground)" }}>
              {companyOf(u).name}
              {companyOf(u).note === "invited" && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}> (invited)</span>}
            </div>
            <div className="col-span-2 text-sm truncate" style={{ color: "var(--muted-foreground)" }}>{u.title || "—"}</div>
            <div className="col-span-1">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={
                  u.onboardedAt
                    ? { background: "var(--green-muted)", color: "var(--green)" }
                    : { background: "var(--amber-muted)", color: "var(--amber)" }
                }
              >
                {u.onboardedAt ? "Done" : "Not yet"}
              </span>
            </div>
            <div className="col-span-3 flex items-center gap-1 flex-wrap">
              {u.id === admin.id ? (
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{ROLE_LABEL[u.role]} (you)</span>
              ) : (
                <form action={setUserRole} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <select
                    name="role"
                    defaultValue={u.role}
                    className="px-2 py-1.5 rounded-md border text-sm"
                    style={{ background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    {schema.userRole.enumValues.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="text-xs font-medium px-3 py-1.5 rounded-md"
                    style={{ background: "var(--navy)", color: "#fff" }}
                  >
                    Save
                  </button>
                </form>
              )}
              {u.id !== admin.id && <DeleteUser name={u.name || u.email} soleCompanies={soleOf(u.id)} remove={deleteUserAction.bind(null, u.id)} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
