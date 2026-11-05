import { readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db";
import { clients, prospectTerms, requirements, users } from "@/lib/db/schema";
import { redact, type Registry } from "@/lib/redaction";
import registryFile from "./registry.json";

const seedDir = path.join(process.cwd(), "seed");

export const readSeedFile = (relativePath: string): string =>
  readFileSync(path.join(seedDir, relativePath), "utf8");

export const seedRegistry: Registry = {
  clients: registryFile.clients.map(({ code, name, aliases }) => ({ code, name, aliases })),
  prospectTerms: registryFile.prospectTerms,
};

export const seedRequirements = [
  { file: "requirements/REQ-A.txt", clientCode: "CLIENT-01", title: "REQ-A Ontology Engineer" },
  { file: "requirements/REQ-B.txt", clientCode: "CLIENT-02", title: "REQ-B Network Access Control Engineer" },
  { file: "requirements/REQ-C.txt", clientCode: "CLIENT-03", title: "REQ-C Data Engineer" },
];

export const seedResumes = ["R1", "R2", "R3", "R4"].map((id) => `resumes/${id}.txt`);

// Safe to run twice: it stops if the seed is already there.
export async function loadSeed(db: Db): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const insertedUsers = await db
    .insert(users)
    .values(registryFile.users.map((u) => ({ ...u, role: u.role as "recruiter" | "stakeholder" | "admin" })))
    .returning();
  const insertedClients = await db.insert(clients).values(registryFile.clients).returning();
  await db.insert(prospectTerms).values(registryFile.prospectTerms.map((term) => ({ term })));

  const recruiter = insertedUsers.find((u) => u.role === "recruiter")!;

  for (const req of seedRequirements) {
    const originalText = readSeedFile(req.file);
    const result = redact(originalText, seedRegistry);
    if (!result.ok) throw new Error(`Seed ${req.title} failed redaction: ${result.reason}`);

    await db.insert(requirements).values({
      clientId: insertedClients.find((c) => c.code === req.clientCode)!.id,
      title: req.title,
      originalText,
      redactedText: result.text,
      createdBy: recruiter.id,
      assignedRecruiterId: recruiter.id,
    });
  }
}
