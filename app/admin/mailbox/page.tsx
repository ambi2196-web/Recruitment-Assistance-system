import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { inboundEmails, users } from "@/lib/db/schema";
import { gmailFromEnv } from "@/lib/mail/gmail";
import { requireRole } from "@/lib/session";
import { ActionForm, SubmitButton } from "../../action-form";
import { checkInbox, updateUserEmail } from "../../requirement-actions";

const OUTCOMES: Record<string, string> = {
  requirement_created: "Requirement created",
  client_answer: "Client answer added",
  needs_client: "Client unclear: sender asked to paste it",
  failed: "Not processed",
  unknown_sender: "Ignored: unknown sender",
  not_authenticated: "Ignored: sender not proven",
  not_a_recruiter: "Refused: only recruiters forward requirements",
  own_email: "Desk's own email",
};

export default async function Mailbox() {
  await requireRole("admin");
  const mail = gmailFromEnv();
  const db = getDb();
  const [team, recent] = await Promise.all([
    db.select().from(users).orderBy(asc(users.id)),
    db.select().from(inboundEmails).orderBy(desc(inboundEmails.id)).limit(30),
  ]);

  return (
    <>
      <p><Link href="/admin">Back to admin</Link></p>
      <h1>Desk mailbox</h1>
      {mail ? (
        <p>Connected to <strong>{mail.address}</strong>. The inbox is checked once a day, or now with this button.</p>
      ) : (
        <p className="notice ambiguity">Not set up. The desk works as a web app until it is. See <code>docs/gmail-setup.md</code>.</p>
      )}
      <ActionForm action={checkInbox}>
        <SubmitButton label="Check the inbox now" busyLabel="Reading new emails…" />
      </ActionForm>

      <h2>Team email addresses</h2>
      <p className="muted">The desk only accepts email from, and sends email to, these addresses.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Email</th></tr></thead>
          <tbody>
            {team.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.role}</td>
                <td>
                  <ActionForm action={updateUserEmail} className="inline-form">
                    <input type="hidden" name="userId" value={user.id} />
                    <input name="email" type="email" defaultValue={user.email} aria-label={`Email for ${user.name}`} required />
                    <SubmitButton label="Save" />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Recent emails</h2>
      {recent.length === 0 ? (
        <p className="muted">No emails handled yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Received</th><th>From</th><th>Subject</th><th>Result</th></tr></thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                  <td>{row.fromAddress}</td>
                  <td>{row.subject}</td>
                  <td>{OUTCOMES[row.outcome] ?? row.outcome}{row.detail ? `: ${row.detail}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
