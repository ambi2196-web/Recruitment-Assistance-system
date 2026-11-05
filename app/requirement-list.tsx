import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, requirements } from "@/lib/db/schema";

const STATUS_LABELS: Record<string, string> = {
  new: "Waiting for check",
  checked: "Needs your decision",
  clarifying: "Waiting for client answer",
  released: "Released on assumption",
  active: "Active",
  closed: "Closed",
};

// Selects only redacted fields. Original text stays out of inboxes (FR-1.6).
export async function RequirementList({ recruiterId, basePath }: { recruiterId?: number; basePath: string }) {
  const rows = await getDb()
    .select({
      id: requirements.id,
      title: requirements.title,
      status: requirements.status,
      clientCode: clients.code,
    })
    .from(requirements)
    .innerJoin(clients, eq(requirements.clientId, clients.id))
    .where(recruiterId === undefined ? undefined : eq(requirements.assignedRecruiterId, recruiterId))
    .orderBy(desc(requirements.id));

  if (rows.length === 0) return <p className="muted">Nothing here yet.</p>;

  return (
    <ul className="inbox">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`${basePath}/${row.id}`}>
            <strong>{row.title}</strong>
            <span className="muted">{row.clientCode} · {STATUS_LABELS[row.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
