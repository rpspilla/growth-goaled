import { PageHeader } from "@/components/PageHeader";
import { TeamPanel } from "@/components/team/TeamPanel";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { companyPeople } from "@/lib/data/team";
import { cancelTeammateInviteAction, inviteTeammateAction, removeTeammateAction } from "./actions";

/** Founders: who has access to the company, and inviting teammates. */
export default async function TeamPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) return <div className="page"><PageHeader title="Team" subtitle="Set up your company first." /></div>;
  const people = await companyPeople(company.id);
  const me = people.members.find((m) => m.userId === user.id);
  return (
    <div className="page space-y-6">
      <PageHeader title="Team" subtitle={`Invite teammates to ${company.name}. They see the same conversations, recommendations, action plans and numbers you do.`} />
      <TeamPanel
        members={people.members.map((m) => ({ ...m, since: m.since.toISOString() }))}
        invites={people.invites}
        meId={user.id}
        canRemove={me?.role === "owner"}
        invite={inviteTeammateAction}
        cancel={cancelTeammateInviteAction}
        remove={removeTeammateAction}
      />
    </div>
  );
}
