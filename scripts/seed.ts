import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");

// Fictional clients and outcomes would corrupt the pilot's real metrics.
if (process.env.APP_ENV === "pilot") {
  console.error("Refusing to load seed data into the pilot.");
  process.exit(1);
}

const { getDb } = await import("../lib/db");
const { loadSeed } = await import("../seed");
await loadSeed(getDb());
const { loadSeedOutcomes } = await import("../seed/outcomes");
await loadSeedOutcomes(getDb());
console.log("Seed data loaded.");
process.exit(0);
