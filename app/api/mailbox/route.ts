import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { gmailFromEnv } from "@/lib/mail/gmail";
import { processInbox, sendReminderEmails } from "@/lib/mailbox";

// Run by the host's scheduler: reads new desk emails and sends due reminders.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  const mail = gmailFromEnv();
  if (!mail) return NextResponse.json({ ok: false, reason: "The desk mailbox is not set up." });

  try {
    const inbox = await processInbox({ db: getDb(), mail });
    const reminders = await sendReminderEmails(getDb(), mail);
    return NextResponse.json({ ok: true, inbox, reminders });
  } catch (error) {
    console.error("Mailbox run failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, reason: "The mailbox run failed. Check the host's logs." }, { status: 500 });
  }
}
