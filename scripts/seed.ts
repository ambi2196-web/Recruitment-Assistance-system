import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");

const { getDb } = await import("../lib/db");
const { loadSeed } = await import("../seed");
await loadSeed(getDb());
console.log("Seed data loaded.");
process.exit(0);
