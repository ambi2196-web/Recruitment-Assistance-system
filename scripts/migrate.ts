import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");

const { migrateDb } = await import("../lib/db");
await migrateDb();
console.log("Database is up to date.");
process.exit(0);
