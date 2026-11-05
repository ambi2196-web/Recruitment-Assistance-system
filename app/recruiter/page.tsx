import { requireRole } from "@/lib/session";
import { RequirementList } from "../requirement-list";

export default async function RecruiterInbox() {
  const user = await requireRole("recruiter");

  return (
    <>
      <h1>Recruiter inbox</h1>
      <RequirementList recruiterId={user.id} />
    </>
  );
}
