import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hiddenInstructionDocx, makePdf } from "../seed/sample-files";

// Writes fictional PDF and Word resumes to seed/files/, so uploads can be tried in a demo.

mkdirSync("seed/files", { recursive: true });

const r1 = readFileSync("seed/resumes/R1.txt", "utf8");
writeFileSync("seed/files/R1.pdf", makePdf(r1.split(/\r?\n/)));

const r3 = readFileSync("seed/resumes/R3.txt", "utf8");
writeFileSync("seed/files/R3-hidden-white-text.docx", await hiddenInstructionDocx(r3));

console.log("Wrote seed/files/R1.pdf and seed/files/R3-hidden-white-text.docx");
