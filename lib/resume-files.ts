import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { WorkflowError } from "./requirements";
import type { DeterministicFlag } from "./submission-checks";

// Resume files are untrusted (G3). We only read text out of them: nothing in a
// file is ever run, and the type is decided by its first bytes, not its name.

export const MAX_RESUME_BYTES = 3 * 1024 * 1024;

export type ParsedResume = { text: string; flags: DeterministicFlag[] };

type Kind = "pdf" | "docx" | "text";

function detectKind(bytes: Uint8Array): Kind | null {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head.startsWith("%PDF-")) return "pdf";
  if (head.startsWith("PK\u0003\u0004")) return "docx";
  // Plain text has no zero bytes in its first part.
  if (bytes.length > 0 && !bytes.slice(0, 1024).includes(0)) return "text";
  return null;
}

async function readPdf(bytes: Uint8Array): Promise<ParsedResume> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return { text, flags: [] };
}

const decodeXml = (text: string) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// Word stores formatting per run of text. A run can be hidden outright, coloured
// white, or set to a size no one can read. Each is a known way to plant keywords.
const HIDING_RULES: [RegExp, string][] = [
  [/<w:vanish\s*\/>|<w:vanish\s+w:val="(?:true|1|on)"\s*\/>/, "hidden"],
  [/<w:color\s+w:val="(?:FFFFFF|ffffff)"/, "white"],
  [/<w:sz\s+w:val="[1-4]"\s*\/>/, "tiny"],
];

async function hiddenDocxText(zip: JSZip): Promise<{ text: string; how: string }[]> {
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return [];

  const found: { text: string; how: string }[] = [];
  for (const run of xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const properties = run[1].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    const rule = HIDING_RULES.find(([pattern]) => pattern.test(properties));
    if (!rule) continue;
    const text = decodeXml([...run[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join(""));
    if (text.trim()) found.push({ text: text.trim(), how: rule[1] });
  }
  return found;
}

async function readDocx(bytes: Uint8Array): Promise<ParsedResume> {
  const zip = await JSZip.loadAsync(bytes);
  if (!zip.file("word/document.xml")) throw new WorkflowError("This file is not a Word document. Please upload PDF, DOCX or plain text.");

  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const hidden = await hiddenDocxText(zip);

  // Hidden text is added to what the code checks read, so instruction-like
  // wording inside it is flagged too. The recruiter sees exactly what was hidden.
  const missing = hidden.filter((h) => !value.includes(h.text));
  const text = missing.length ? `${value}\n${missing.map((h) => h.text).join("\n")}` : value;

  const flags = hidden.map((h) => ({
    type: "hidden_text" as const,
    detail: `The Word file has ${h.how} text: "${h.text.slice(0, 120)}"`,
  }));
  return { text, flags };
}

export async function readResumeFile(file: { name: string; bytes: Uint8Array }): Promise<ParsedResume> {
  if (file.bytes.length === 0) throw new WorkflowError("The file is empty.");
  if (file.bytes.length > MAX_RESUME_BYTES) throw new WorkflowError("The file is over 3 MB. Please paste the text instead.");

  const kind = detectKind(file.bytes);
  let parsed: ParsedResume;
  try {
    if (kind === "pdf") parsed = await readPdf(file.bytes);
    else if (kind === "docx") parsed = await readDocx(file.bytes);
    else if (kind === "text") parsed = { text: new TextDecoder().decode(file.bytes), flags: [] };
    else throw new WorkflowError("Please upload a PDF, DOCX or plain text file.");
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError("The file could not be read. Please paste the text instead.");
  }

  if (parsed.text.trim().length < 20) {
    throw new WorkflowError("No text was found in the file. It may be a scanned image. Please paste the text instead.");
  }
  return parsed;
}
