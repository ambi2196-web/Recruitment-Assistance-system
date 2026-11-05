import { asc } from "drizzle-orm";
import { isDemoMode } from "@/lib/config";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { switchUser } from "./actions";

export default async function Home() {
  if (!isDemoMode()) {
    return <p>Sign-in is not available yet. Real login arrives in Phase 4.</p>;
  }

  const people = await getDb().select().from(users).orderBy(asc(users.id));

  return (
    <>
      <h1>Choose a demo user</h1>
      <p className="muted">Demo mode, with synthetic data only.</p>
      <ul className="user-list">
        {people.map((person) => (
          <li key={person.id}>
            <form action={switchUser}>
              <input type="hidden" name="userId" value={person.id} />
              <button type="submit">{person.name} ({person.role})</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
