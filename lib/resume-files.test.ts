import { describe, expect, it } from "vitest";
import { readSeedFile, seedRegistry } from "@/seed";
import { hiddenInstructionDocx, makeDocx, makePdf } from "@/seed/sample-files";
import { redactCandidateText } from "./redaction";
import { MAX_RESUME_BYTES, readResumeFile } from "./resume-files";
import { runDeterministicChecks } from "./submission-checks";

const read = (bytes: Uint8Array, name = "resume") => readResumeFile({ name, bytes });

describe("reading resume files (Phase 4)", () => {
  it("reads a PDF", async () => {
    const parsed = await read(makePdf(readSeedFile("resumes/R1.txt").split(/\r?\n/)), "r1.pdf");
    expect(parsed.text).toContain("Senior Data Engineer, Brightwell Analytics, Jan 2021 - Present");
    expect(parsed.flags).toEqual([]);
  });

  it("reads a Word file", async () => {
    const parsed = await read(await makeDocx([[{ text: "Elena Novak" }], [{ text: "Knowledge Engineer, Apr 2020 - Present" }]]));
    expect(parsed.text).toContain("Knowledge Engineer, Apr 2020 - Present");
    expect(parsed.flags).toEqual([]);
  });

  it("reads plain text", async () => {
    const parsed = await read(new TextEncoder().encode(readSeedFile("resumes/R2.txt")));
    expect(parsed.text).toContain("Daniel Marsh");
  });

  it("decides the type from the content, not the name", async () => {
    const parsed = await read(makePdf(["A resume line long enough to read"]), "resume.docx");
    expect(parsed.text).toContain("A resume line long enough to read");
  });

  it.each([
    ["an empty file", new Uint8Array(), "empty"],
    ["a file over the limit", new Uint8Array(MAX_RESUME_BYTES + 1), "over 3 MB"],
    ["a binary file", new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 0, 1]), "PDF, DOCX or plain text"],
    ["a zip that is not Word", null, "not a Word document"],
    ["a broken PDF", new TextEncoder().encode("%PDF-1.4 nonsense"), "could not be read"],
    ["a PDF with no text", makePdf([]), "No text was found"],
  ])("refuses %s with a clear message", async (_label, bytes, message) => {
    let input = bytes;
    if (input === null) {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("notes.txt", "hello");
      input = await zip.generateAsync({ type: "uint8array" });
    }
    await expect(read(input)).rejects.toThrow(message);
  });
});

describe("hidden text in Word files (FR-6.2, G3)", () => {
  it.each([["vanish", "hidden"], ["white", "white"], ["tiny", "tiny"]] as const)("flags %s text", async (hiding, how) => {
    const parsed = await read(await makeDocx([[{ text: "Data engineer, Jan 2020 - Present" }], [{ text: "Python Spark Snowflake", hiding }]]));
    expect(parsed.flags).toEqual([{ type: "hidden_text", detail: `The Word file has ${how} text: "Python Spark Snowflake"` }]);
    expect(parsed.text).toContain("Python Spark Snowflake");
  });

  it("finds R3's instruction when it is hidden in white text", async () => {
    const parsed = await read(await hiddenInstructionDocx(readSeedFile("resumes/R3.txt")));
    expect(parsed.flags.map((f) => f.type)).toContain("hidden_text");

    const codeFlags = runDeterministicChecks({ resume: parsed.text, callNotes: "", mustHaves: [] }).map((f) => f.type);
    expect(codeFlags).toContain("instruction_like_text");
  });

  it("still masks and redacts text from a file", async () => {
    const parsed = await read(makePdf(readSeedFile("resumes/R1.txt").split(/\r?\n/)));
    const result = redactCandidateText(parsed.text, "Priya Venkataraman", seedRegistry);
    expect(result.ok && result.text).not.toMatch(/priya|@|555/i);
  });
});
