import { after } from "next/server";
import { getDb, type Db } from "@/lib/db";
import { gmailFromEnv } from "@/lib/mail/gmail";
import type { MailClient } from "@/lib/mail/types";

// Emails go out after the page responds, so a slow mailbox never slows a decision.
// With no mailbox set up, this does nothing and the desk works as a web app.
export function notifyLater(work: (db: Db, mail: MailClient) => Promise<void>) {
  const mail = gmailFromEnv();
  if (!mail) return;
  after(() => work(getDb(), mail).catch((error) => console.error("Desk email not sent:", error instanceof Error ? error.message : error)));
}
