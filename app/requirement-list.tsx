import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, requirements } from "@/lib/db/schema";

// Selects only the redacted text. Original text stays out of the inbox (FR-1.6).
export async function RequirementList({ recruiterId }: { recruiterId?: number }) {
  const rows = await getDb()
    .select({
      id: requirements.id,
      title: requirements.title,
      text: requirements.redactedText,
      status: requirements.status,
      clientCode: clients.code,
    })
    .from(requirements)
    .innerJoin(clients, eq(requirements.clientId, clients.id))
    .where(recruiterId === undefined ? undefined : eq(requirements.assignedRecruiterId, recruiterId))
    .orderBy(desc(requirements.id));

  if (rows.length === 0) return <p className="muted">Nothing here yet.</p>;

  return rows.map((row) => (
    <article className="card" key={row.id}>
      <h2>{row.title}</h2>
      <p className="muted">{row.clientCode}, status: {row.status}</p>
      <pre>{row.text}</pre>
    </article>
  ));
}
