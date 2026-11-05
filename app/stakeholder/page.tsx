import { requireRole } from "@/lib/session";
import { RequirementList } from "../requirement-list";

export default async function StakeholderInbox() {
  await requireRole("stakeholder");

  return (
    <>
      <h1>Stakeholder inbox</h1>
      <RequirementList />
    </>
  );
}
