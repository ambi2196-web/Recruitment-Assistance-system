// Deterministic checks (FR-6.2). Code runs these, not a model, so that a resume
// cannot talk its way past them. They run on the raw resume before masking,
// because phone codes and hidden characters are lost once it is masked.
// Flags are prompts for a human to look closer. They never judge the person (G4).

export type FlagType =
  | "date_overlap"
  | "employment_gap"
  | "missing_dates"
  | "years_mismatch"
  | "phone_location_mismatch"
  | "location_timezone_mismatch"
  | "must_have_not_found"
  | "instruction_like_text"
  | "hidden_text"
  | "near_duplicate";

export type DeterministicFlag = { type: FlagType; detail: string };

type Span = { start: number; end: number; label: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MIN_GAP_MONTHS = 6;
// Rounded dates easily lose a few months, so only a clear excess is worth a flag.
const YEARS_TOLERANCE = 1;

const DATE = String.raw`(?:[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})`;
const DATE_RANGE = new RegExp(String.raw`(${DATE})\s*(?:-|–|—|to)\s*(${DATE}|present|current|now|till date|to date)`, "gi");

const monthIndex = (year: number, month: number) => year * 12 + month;

function parseDate(text: string, isEnd: boolean): number | null {
  const named = text.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[1].toLowerCase());
    return month === -1 ? null : monthIndex(Number(named[2]), month);
  }
  const numeric = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (numeric) return monthIndex(Number(numeric[2]), Number(numeric[1]) - 1);
  const year = text.match(/^(\d{4})$/);
  if (year) return monthIndex(Number(year[1]), isEnd ? 11 : 0);
  return null;
}

function parseSpans(resume: string, now: Date): Span[] {
  const today = monthIndex(now.getUTCFullYear(), now.getUTCMonth());
  const spans: Span[] = [];

  for (const line of resume.split(/\r?\n/)) {
    for (const match of line.matchAll(DATE_RANGE)) {
      const start = parseDate(match[1], false);
      const end = /^\d|^[a-z]{3,9}\.?\s+\d/i.test(match[2]) ? parseDate(match[2], true) : today;
      if (start === null || end === null || end < start) continue;
      const label = line.slice(0, match.index).replace(/[,|\s-]+$/, "").trim() || "A role";
      spans.push({ start, end, label });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function checkDates(spans: Span[]): DeterministicFlag[] {
  const flags: DeterministicFlag[] = [];

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spans[j].start < spans[i].end) {
        flags.push({ type: "date_overlap", detail: `"${spans[i].label}" and "${spans[j].label}" have overlapping dates.` });
      }
    }
  }

  let latestEnd = spans[0]?.end ?? 0;
  for (const span of spans.slice(1)) {
    const gap = span.start - latestEnd - 1;
    if (gap > MIN_GAP_MONTHS) flags.push({ type: "employment_gap", detail: `A gap of ${gap} months before "${span.label}".` });
    latestEnd = Math.max(latestEnd, span.end);
  }

  return flags;
}

function checkMissingDates(resume: string, spans: Span[]): DeterministicFlag[] {
  if (spans.length === 0) return [{ type: "missing_dates", detail: "No employment dates were found in the resume." }];

  const section = resume.match(/^\s*(?:work\s+|professional\s+)?experience\s*$([\s\S]*?)(?=^\s*(?:skills|education|certifications|projects)\s*$|$(?![\s\S]))/im)?.[1];
  if (!section) return [];

  // In this section, a line that is not a bullet is normally a role heading.
  const undated = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[-•*]/.test(line) && line.includes(",") && line.length < 90)
    .filter((line) => !line.match(new RegExp(DATE_RANGE.source, "i")));

  return undated.map((line) => ({ type: "missing_dates" as const, detail: `No dates on: ${line}` }));
}

function checkYears(resume: string, spans: Span[]): DeterministicFlag[] {
  const claim = resume.match(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b(?:\s+\w+){0,2}?\s+(?:of\s+)?experience/i);
  if (!claim || spans.length === 0) return [];

  const claimed = Number(claim[1]);
  const listedMonths = spans.reduce((total, span) => total + (span.end - span.start + 1), 0);
  const listedYears = listedMonths / 12;

  // Only overclaiming matters. "8 years" on a resume with 9 listed is just an older summary.
  if (claimed <= listedYears + YEARS_TOLERANCE) return [];
  return [{ type: "years_mismatch", detail: `Claims ${claimed} years, but the listed roles add up to about ${listedYears.toFixed(1)}.` }];
}

const PHONE_COUNTRIES: Record<string, string> = { "1": "United States", "91": "India", "44": "United Kingdom" };

const US_ZONES: Record<string, string[]> = {
  ET: ["CT", "DC", "DE", "FL", "GA", "IN", "KY", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC", "TN", "VA", "VT", "WV"],
  CT: ["AL", "AR", "FL", "IA", "IL", "IN", "KS", "KY", "LA", "MI", "MN", "MO", "MS", "ND", "NE", "OK", "SD", "TN", "TX", "WI"],
  MT: ["AZ", "CO", "ID", "KS", "MT", "ND", "NE", "NM", "SD", "TX", "UT", "WY"],
  PT: ["CA", "ID", "NV", "OR", "WA"],
  AKT: ["AK"],
  HT: ["HI"],
};
const US_STATES = new Set(Object.values(US_ZONES).flat());
const INDIAN_PLACES = /\b(india|hyderabad|bangalore|bengaluru|pune|mumbai|chennai|delhi|noida|gurgaon|gurugram|kolkata|indore|nagpur|ahmedabad)\b/i;
const UK_PLACES = /\b(united kingdom|uk|london|manchester|birmingham|leeds)\b/i;

type Place = { text: string; country: string; state?: string };

function findPlace(text: string): Place | null {
  for (const match of text.matchAll(/\b([A-Z][A-Za-z. ]+),\s*([A-Z]{2})\b/g)) {
    if (US_STATES.has(match[2])) return { text: match[0].trim(), country: "United States", state: match[2] };
  }
  const indian = text.match(INDIAN_PLACES);
  if (indian) return { text: indian[0], country: "India" };
  const british = text.match(UK_PLACES);
  if (british) return { text: british[0], country: "United Kingdom" };
  return null;
}

function checkPhone(resume: string, notes: string): DeterministicFlag[] {
  const code = `${resume}\n${notes}`.match(/\+\s?(\d{1,3})[\s(.-]/)?.[1];
  const phoneCountry = code ? PHONE_COUNTRIES[code] : undefined;
  const place = findPlace(notes) ?? findPlace(resume);
  if (!phoneCountry || !place || phoneCountry === place.country) return [];
  return [{ type: "phone_location_mismatch", detail: `Phone code +${code} is ${phoneCountry}, but the stated location is ${place.text}.` }];
}

const ZONE_WORDS: [string, RegExp][] = [
  ["IST", /\b(ist|india standard time)\b/i],
  ["ET", /\b(et|est|edt|eastern(?: time)?)\b/i],
  ["CT", /\b(ct|cst|cdt|central(?: time)?)\b/i],
  ["MT", /\b(mt|mst|mdt|mountain(?: time)?)\b/i],
  ["PT", /\b(pt|pst|pdt|pacific(?: time)?)\b/i],
  ["GMT", /\b(gmt|bst|utc)\b/i],
];

function checkTimezone(resume: string, notes: string): DeterministicFlag[] {
  const zone = ZONE_WORDS.find(([, pattern]) => pattern.test(notes))?.[0];
  const place = findPlace(notes) ?? findPlace(resume);
  if (!zone || !place) return [];

  const fits =
    (place.country === "India" && zone === "IST") ||
    (place.country === "United Kingdom" && zone === "GMT") ||
    (place.state !== undefined && (US_ZONES[zone] ?? []).includes(place.state));

  return fits ? [] : [{ type: "location_timezone_mismatch", detail: `The notes mention ${zone} time, but the location is ${place.text}.` }];
}

const STOP_WORDS = new Set(["and", "or", "with", "the", "for", "of", "in", "on", "to", "a", "an", "understanding", "experience", "strong", "good", "knowledge", "hands"]);

const tokens = (text: string) =>
  text.toLowerCase().split(/[^a-z0-9.+#]+/).map((t) => t.replace(/\.+$/, "")).filter((t) => t && !STOP_WORDS.has(t));

// A must-have is a phrase, so it counts as found when at least half its words appear.
function checkMustHaves(mustHaves: string[], resume: string, notes: string): DeterministicFlag[] {
  const found = new Set(tokens(`${resume}\n${notes}`));
  return mustHaves
    .filter((mustHave) => {
      const words = tokens(mustHave);
      return words.length > 0 && words.filter((w) => found.has(w)).length < Math.ceil(words.length / 2);
    })
    .map((mustHave) => ({ type: "must_have_not_found" as const, detail: `Not in the resume or call notes: ${mustHave}` }));
}

const INSTRUCTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|guidelines?)\b/i,
  /\b(?:rate|rank|score|recommend|select|shortlist|approve|hire)\s+(?:this|the)\s+(?:candidate|applicant|resume|person)\b/i,
  /\b(?:best|top|perfect)\s+(?:match|candidate|fit)\b/i,
  /\b(?:system prompt|you are an? (?:ai|assistant|model|language model)|as an ai\b|ai (?:reader|screener|recruiter|assistant|model))\b/i,
];

function checkInstructions(resume: string): DeterministicFlag[] {
  return resume
    .split(/\r?\n/)
    .filter((line) => INSTRUCTION_PATTERNS.some((pattern) => pattern.test(line)))
    .map((line) => ({ type: "instruction_like_text" as const, detail: `Looks like an instruction to an AI: "${line.trim().slice(0, 120)}"` }));
}

function checkHiddenText(resume: string): DeterministicFlag[] {
  const flags: DeterministicFlag[] = [];
  if (/[​-‍⁠﻿­]/.test(resume)) flags.push({ type: "hidden_text", detail: "The resume contains invisible characters." });
  if (/[\u{E0000}-\u{E007F}]/u.test(resume)) flags.push({ type: "hidden_text", detail: "The resume contains invisible tag characters." });
  if (/[ \t]{40,}\S/.test(resume)) flags.push({ type: "hidden_text", detail: "Text sits far to the right of the page, which can hide it." });
  return flags;
}

const NEAR_DUPLICATE_THRESHOLD = 0.8;

function trigrams(text: string): Set<string> {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  return new Set(words.slice(2).map((word, i) => `${words[i]} ${words[i + 1]} ${word}`));
}

/** Compares two already-masked resumes. Used only to raise a flag, and never shown as a number (G4). */
export function isNearDuplicate(a: string, b: string): boolean {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return false;
  const shared = [...left].filter((t) => right.has(t)).length;
  return shared / (left.size + right.size - shared) >= NEAR_DUPLICATE_THRESHOLD;
}

export function runDeterministicChecks(input: { resume: string; callNotes: string; mustHaves: string[]; now?: Date }): DeterministicFlag[] {
  const { resume, callNotes, mustHaves, now = new Date() } = input;
  const spans = parseSpans(resume, now);

  return [
    ...checkDates(spans),
    ...checkMissingDates(resume, spans),
    ...checkYears(resume, spans),
    ...checkPhone(resume, callNotes),
    ...checkTimezone(resume, callNotes),
    ...checkMustHaves(mustHaves, resume, callNotes),
    ...checkInstructions(resume),
    ...checkHiddenText(resume),
  ];
}
