import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Connection = { db: Db; migrate: () => Promise<void> };

const migrationsFolder = path.join(process.cwd(), "lib", "db", "migrations");

// Deployed sites use a postgres:// URL. Local work and tests use PGlite,
// an embedded Postgres, so nobody needs a database account to run the app.
function connect(): Connection {
  const url = process.env.DATABASE_URL?.trim();

  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const db = drizzlePg(new Pool({ connectionString: url }), { schema });
    return { db: db as unknown as Db, migrate: () => migratePg(db, { migrationsFolder }) };
  }

  const localFolder = path.join(process.cwd(), ".data");
  if (!url) mkdirSync(localFolder, { recursive: true });

  const db = drizzlePglite(new PGlite(url || path.join(localFolder, "pglite")), { schema });
  return { db: db as unknown as Db, migrate: () => migratePglite(db, { migrationsFolder }) };
}

// Kept on globalThis because dev-mode reloads would otherwise open
// a second PGlite on the same folder, which it does not allow.
const store = globalThis as unknown as { requirementDesk?: Connection };

function connection(): Connection {
  store.requirementDesk ??= connect();
  return store.requirementDesk;
}

export const getDb = (): Db => connection().db;
export const migrateDb = (): Promise<void> => connection().migrate();
