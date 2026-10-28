import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { setUserRole } from "./actions";

const ROLE_LABEL = { founder: "Founder", advisor: "Advisor", admin: "Admin" } as const;

export default async function UsersPage() {
  const admin = await requireRole(["admin"]);
  const users = await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      <PageHeader
        title="Users"
        subtitle="Make someone an advisor or admin here. People appear after their first sign-in; everyone starts as a founder."
      />
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div
          className="grid grid-cols-12 px-5 py-3 border-b label"
          style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          <div className="col-span-4">Person</div>
          <div className="col-span-3">Title</div>
          <div className="col-span-2">Profile</div>
          <div className="col-span-3">Role</div>
        </div>
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-12 items-center px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="col-span-4 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{u.name || "—"}</div>
              <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{u.email}</div>
            </div>
            <div className="col-span-3 text-sm truncate" style={{ color: "var(--muted-foreground)" }}>{u.title || "—"}</div>
            <div className="col-span-2">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={
                  u.onboardedAt
                    ? { background: "var(--green-muted)", color: "var(--green)" }
                    : { background: "var(--amber-muted)", color: "var(--amber)" }
                }
              >
                {u.onboardedAt ? "Complete" : "Not finished"}
              </span>
            </div>
            <div className="col-span-3">
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
