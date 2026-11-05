import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "./config";
import { getDb } from "./db";
import { users } from "./db/schema";

export const DEMO_USER_COOKIE = "demo_user_id";

export type User = typeof users.$inferSelect;
export type Role = User["role"];

export const ROLE_HOME: Record<Role, string> = {
  stakeholder: "/stakeholder",
  recruiter: "/recruiter",
  admin: "/admin",
};

// With demo mode off there is no login until Phase 4, so nobody gets in.
export async function getCurrentUser(): Promise<User | null> {
  if (!isDemoMode()) return null;
  const id = Number((await cookies()).get(DEMO_USER_COOKIE)?.value);
  if (!Number.isInteger(id)) return null;
  const [user] = await getDb().select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function requireRole(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (user?.role !== role) redirect("/");
  return user;
}
