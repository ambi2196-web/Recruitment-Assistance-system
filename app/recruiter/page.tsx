import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../action-form";
import { intake } from "../requirement-actions";
import { RequirementList } from "../requirement-list";

export default async function RecruiterInbox() {
  const user = await requireRole("recruiter");
  const clientOptions = await getDb().select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name));

  return (
    <div className="two-columns">
      <section>
        <h1>Recruiter inbox</h1>
        <RequirementList recruiterId={user.id} basePath="/recruiter" />
      </section>
      <section className="card">
        <h2>Forward a client email</h2>
        <ActionForm action={intake} className="stack">
          <label>
            Client
            <select name="clientId" required>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <input name="subject" required />
          </label>
          <label>
            Email text
            <textarea name="body" rows={10} required />
          </label>
          <SubmitButton label="Send to the desk" busyLabel="Redacting and checking. This can take up to a minute…" />
        </ActionForm>
      </section>
    </div>
  );
}
