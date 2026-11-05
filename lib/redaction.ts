// Redaction is the main defence for guardrail G1. Its bias is deliberate:
// hiding too much is harmless, but leaking once is not. So patterns are broad,
// and if anything still looks sensitive afterwards we refuse to continue.

export type RegistryClient = { code: string; name: string; aliases: string[] };
export type Registry = { clients: RegistryClient[]; prospectTerms: string[] };

// Only redact() can produce this type, so passing raw text to a model
// is a compile error rather than something a reviewer has to spot.
export type RedactedText = string & { readonly __brand: "RedactedText" };

export type RedactionResult =
  | { ok: true; text: RedactedText }
  | { ok: false; reason: string };

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const RANGE = String.raw`${NUM}(?:\s*(?:-|–|—|to)\s*${NUM})?`;
const SYMBOL = String.raw`[$₹£€]`;
const CURRENCY_CODE = String.raw`(?:usd|inr|cad|gbp|eur|aud)`;
const CURRENCY_WORD = String.raw`(?:${CURRENCY_CODE}|dollars?|bucks|rupees?|rs\.?)`;
const PERIOD = String.raw`(?:hour|hr|h|day|week|wk|month|mo|year|yr|annum)`;
const PER_PERIOD = String.raw`(?:\s*(?:\/|per|an?|p\/)\s*${PERIOD}\b|\s*p\.?a\b\.?|\s*ph\b)`;
const SCALE = String.raw`(?:k|m|mn|lpa|lacs?|lakhs?|crores?|thousand|million|grand)`;

// The trailing \b stops "seven" from matching the start of "seventy".
const NUMBER_WORD = String.raw`(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b`;
const WORD_AMOUNT = String.raw`\b(?:a\s+)?${NUMBER_WORD}(?:[\s-]+(?:and\s+)?${NUMBER_WORD})*`;

// Words that join a rate keyword to its number, as in "rate is capped at 70".
const FILLER = String.raw`(?:[\s:=~@-]|\b(?:is|are|of|at|up|to|around|about|approx|approximately|max|maximum|min|minimum|cap|capped|ceiling|range|will|be|not|exceed|nte|only|upto|usd|inr)\b\.?)*`;
const EXACT_AMOUNT = String.raw`(?:${SYMBOL}\s*)?${RANGE}`;
const TERMS = String.raw`(?:c2c|corp[\s-]?to[\s-]?corp|w-?2|1099|nte|all[\s-]in)`;
const QUALIFIED_RATE = String.raw`(?:bill(?:ing)?|pay|hourly|contract|client|target|max|maximum|vendor|our)\s+rates?`;
const MONEY_WORD = String.raw`(?:${QUALIFIED_RATE}|salary|ctc|budget|compensation|comp|margin|markup|billing)`;
// Too common to justify blocking on, so the leftover check ignores these.
// They are still redacted when a number follows directly.
const LOOSE_MONEY_WORD = String.raw`(?:pay|pays|paying|bill)`;
const NEGOTIATION_WORD = String.raw`(?:offer|offers|offered|offering|asking|expects?|expected|expecting|expectations?|wants?|quoted?|quoting)`;
// "expected 5 years" is experience, not money. The [\d.,]* stops a partial number match.
const NOT_DURATION = String.raw`(?![\d.,]*\s*\+?\s*(?:years?|yrs?|months?|mos?|weeks?|wks?|days?|hours?|hrs?|%|percent\b))`;
const TAIL = String.raw`(?:\s*${SCALE}\b)?(?:\s*${CURRENCY_WORD}\b|\s*${SYMBOL})?(?:\/-)?(?:${PER_PERIOD})?`;

const rx = (source: string) => new RegExp(source, "giu");

const RATE_PATTERNS: RegExp[] = [
  // Terms and keywords first, because they can swallow a following amount whole.
  rx(String.raw`\b${TERMS}\b${FILLER}(?:${EXACT_AMOUNT}|${WORD_AMOUNT})${TAIL}%?`),
  rx(String.raw`\b(?:${MONEY_WORD}|${LOOSE_MONEY_WORD})\b${FILLER}(?:${EXACT_AMOUNT}|${WORD_AMOUNT})${TAIL}\s*(?:%|percent\b)?`),
  // A bare "rate" may be a technical one such as "error rate of 2%", so skip percentages.
  rx(String.raw`\brates?\b${FILLER}(?:${EXACT_AMOUNT}|${WORD_AMOUNT})(?![\d.,]*\s*(?:%|percent\b))${TAIL}`),
  rx(String.raw`\b${NEGOTIATION_WORD}\b${FILLER}(?:${EXACT_AMOUNT}|${WORD_AMOUNT})${NOT_DURATION}${TAIL}`),
  // 85 bill, 60 pay, 60 hourly, 65 on C2C
  rx(String.raw`\b${RANGE}\s*(?:(?:bill(?:ing)?|pay|hourly|rate)\b|(?:on\s+)?${TERMS}\b)`),
  // mid 70s, low-80s
  rx(String.raw`\b(?:low|mid|high|upper)[\s-]*\d{2,3}(?:s|k)\b`),
  // $85/hr, $120k, ₹1,50,000, $85 USD per hour
  rx(String.raw`${SYMBOL}\s*${NUM}${TAIL}`),
  // USD 85, Rs. 5000
  rx(String.raw`\b${CURRENCY_WORD}\s*${NUM}${TAIL}`),
  // 85 USD per hour, 85 dollars
  rx(String.raw`\b${RANGE}\s*(?:${SCALE}\s*)?${CURRENCY_WORD}(?![\p{L}\p{N}])(?:\/-)?(?:${PER_PERIOD})?`),
  // 85$/hr, 60 $, 70/- per hour
  rx(String.raw`\b${RANGE}\s*(?:${SYMBOL}(?:\/-)?|\/-)(?:${PER_PERIOD})?`),
  // 85/hr, 85-95 per hour, 150000/yr
  rx(String.raw`\b${RANGE}${PER_PERIOD}`),
  // 120k, 120-140k, 18 LPA, 12 lakh
  rx(String.raw`\b${NUM}(?:\s*(?:-|–|—|to)\s*${NUM}\s*k?)?\s*(?:k|lpa|lacs?|lakhs?|crores?|grand)\b(?:${PER_PERIOD})?`),
  // eighty five dollars an hour, seventy per hour, twelve lakh, sixty-five k
  rx(String.raw`${WORD_AMOUNT}\s*(?:(?:${CURRENCY_WORD}|k|lpa|lacs?|lakhs?|crores?|thousand|grand)\b(?:${PER_PERIOD})?|${PER_PERIOD})`),
];

// Catches amounts the patterns above missed, for the self-check only.
// These words rarely sit next to an innocent number, so stopping is the safe choice.
const LEFTOVER_MONEY = rx(String.raw`\b(?:${MONEY_WORD}|${TERMS})\b[^\n]{0,30}?\d`);

const EMAIL = /[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/giu;

// Needs at least 10 digits, so that years and date ranges survive.
const PHONE = /(?<![\p{L}\p{N}])(?:\+\s?\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d(?:[\s.-]?\d){5,13}(?![\p{L}\p{N}])/gu;
const countDigits = (s: string) => s.replace(/\D/g, "").length;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Hidden characters could otherwise split a name so that it evades matching.
const normalise = (text: string) => text.normalize("NFKC").replace(/[​-‍⁠﻿­]/g, "");

// Builds a matcher that tolerates case, separators ("Halvorsen-Energy")
// and spelled-out initials ("H.E.S.", "H E S"), and never matches inside a longer word.
function termPattern(term: string): RegExp {
  const words = term.trim().split(/[\s_.-]+/).filter(Boolean).map(escapeRegex);
  let body = words.join(String.raw`[\s_.-]+`);
  if (/^[A-Z]{2,5}$/.test(term.trim())) {
    body = `(?:${body}|${[...term.trim()].join(String.raw`[.\s]{1,2}`)}\\.?)`;
  }
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${body}(?![\p{L}\p{N}])`, "giu");
}

const byLongestFirst = (a: string, b: string) => b.length - a.length;

function clientTerms(registry: Registry): { term: string; code: string }[] {
  return registry.clients
    .flatMap((c) => [c.name, ...c.aliases].map((term) => ({ term, code: c.code })))
    .filter(({ term }) => term.trim() !== "")
    .sort((a, b) => byLongestFirst(a.term, b.term));
}

const stripTokens = (text: string) =>
  text.replace(/\[(?:RATE|EMAIL|PHONE|PROSPECT)\]/g, " ").replace(/\bCLIENT-\d+\b/g, " ");

const compact = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Short terms are skipped in the compact check. "hes" appears inside
// "ashes" once spaces are gone, which would block almost everything.
const MIN_COMPACT_LENGTH = 6;

/**
 * Returns a reason if the text still looks sensitive, otherwise null.
 * Runs after redact(), and again just before any model call.
 * Reasons name the kind of problem only, so they are safe to log and display.
 */
export function selfCheck(text: string, registry: Registry): string | null {
  const stripped = stripTokens(normalise(text));

  const terms = [
    ...clientTerms(registry).map(({ term }) => ({ term, label: "A client name" })),
    ...registry.prospectTerms.map((term) => ({ term, label: "A prospect name" })),
  ];

  const compacted = compact(stripped);
  for (const { term, label } of terms) {
    if (termPattern(term).test(stripped)) return `${label} is still in the text.`;
    const compactTerm = compact(term);
    if (compactTerm.length >= MIN_COMPACT_LENGTH && compacted.includes(compactTerm)) {
      return `${label} may be hidden in the text (spaced or split).`;
    }
  }

  if (RATE_PATTERNS.some((p) => new RegExp(p).test(stripped))) return "A rate or money amount is still in the text.";
  if (new RegExp(LEFTOVER_MONEY).test(stripped)) return "A number near a rate or money word could not be redacted.";
  if (new RegExp(EMAIL).test(stripped)) return "An email address is still in the text.";
  if ([...stripped.matchAll(PHONE)].some((m) => countDigits(m[0]) >= 10)) return "A phone number is still in the text.";

  return null;
}

export function redact(input: string, registry: Registry): RedactionResult {
  // An empty registry means client names cannot be caught at all.
  if (registry.clients.length === 0) return { ok: false, reason: "The client registry is empty." };

  // Emails go first so a client's domain disappears with the address.
  let text = normalise(input).replace(EMAIL, "[EMAIL]");
  text = text.replace(PHONE, (m) => (countDigits(m) >= 10 ? "[PHONE]" : m));

  for (const term of [...registry.prospectTerms].sort(byLongestFirst)) {
    text = text.replace(termPattern(term), "[PROSPECT]");
  }
  for (const { term, code } of clientTerms(registry)) {
    text = text.replace(termPattern(term), code);
  }
  for (const pattern of RATE_PATTERNS) {
    text = text.replace(pattern, "[RATE]");
  }

  const problem = selfCheck(text, registry);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, text: text as RedactedText };
}
