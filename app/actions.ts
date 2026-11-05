"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runDummyAgent } from "@/lib/agents/a0_dummy";
import { isDemoMode } from "@/lib/config";
import { getDb } from "@/lib/db";
import { requirements, users } from "@/lib/db/schema";
import { LlmBlockedError, LlmOutputError, loadRegistry } from "@/lib/llm";
import { redact } from "@/lib/redaction";
import { DEMO_USER_COOKIE, ROLE_HOME, requireRole } from "@/lib/session";

export async function switchUser(formData: FormData) {
  if (!isDemoMode()) redirect("/");

  const id = Number(formData.get("userId"));
  const [user] = await getDb().select().from(users).where(eq(users.id, id));
  if (!user) redirect("/");

  (await cookies()).set(DEMO_USER_COOKIE, String(user.id), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(ROLE_HOME[user.role]);
}

export async function signOutDemo() {
  (await cookies()).delete(DEMO_USER_COOKIE);
  redirect("/");
}

export async function runPipelineTest() {
  const admin = await requireRole("admin");
  const db = getDb();

  const [requirement] = await db.select().from(requirements).limit(1);
  if (!requirement) redirect("/admin?error=" + encodeURIComponent("No seed requirement found."));

  const redacted = redact(requirement.redactedText, await loadRegistry(db));
  if (!redacted.ok) redirect("/admin?error=" + encodeURIComponent(redacted.reason));

  let message: string | null = null;
  try {
    await runDummyAgent(redacted.text, { userId: admin.id, linkedRecordId: `requirement:${requirement.id}` });
  } catch (error) {
    if (!(error instanceof LlmBlockedError || error instanceof LlmOutputError)) throw error;
    message = error.message;
  }
  redirect(message ? "/admin?error=" + encodeURIComponent(message) : "/admin");
}
