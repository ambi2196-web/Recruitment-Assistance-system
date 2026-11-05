import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, prospectTerms } from "@/lib/db/schema";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../../action-form";
import { addClient, addProspect, updateAliases } from "../../requirement-actions";

export default async function Registry() {
  await requireRole("admin");
  const db = getDb();
  const [clientRows, prospects] = await Promise.all([
    db.select().from(clients).orderBy(asc(clients.code)),
    db.select().from(prospectTerms).orderBy(asc(prospectTerms.term)),
  ]);

  return (
    <>
      <p><Link href="/admin">Back to admin</Link></p>
      <h1>Client registry</h1>
      <p className="muted">This list drives redaction. It is never sent to an AI model.</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Name</th><th>Industry</th><th>Aliases (separate with commas)</th></tr>
          </thead>
          <tbody>
            {clientRows.map((client) => (
              <tr key={client.id}>
                <td>{client.code}</td>
                <td>{client.name}</td>
                <td>{client.industryLabel}</td>
                <td>
                  <ActionForm action={updateAliases} className="inline-form">
                    <input type="hidden" name="clientId" value={client.id} />
                    <input name="aliases" defaultValue={client.aliases.join(", ")} aria-label={`Aliases for ${client.code}`} />
                    <SubmitButton label="Save" />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two-columns">
        <section className="card">
          <h2>Add a client</h2>
          <ActionForm action={addClient} className="stack">
            <label>Name <input name="name" required /></label>
            <label>Aliases <input name="aliases" /></label>
            <label>Industry label <input name="industryLabel" required /></label>
            <SubmitButton label="Add client" />
          </ActionForm>
        </section>
        <section className="card">
          <h2>RFP and prospect names</h2>
          <ul className="tight">{prospects.map((prospect) => <li key={prospect.id}>{prospect.term}</li>)}</ul>
          <ActionForm action={addProspect} className="stack">
            <label>New term <input name="term" required /></label>
            <SubmitButton label="Add term" />
          </ActionForm>
        </section>
      </div>
    </>
  );
}
