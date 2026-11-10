import type { InboundMessage, MailClient, OutboundMessage } from "./types";

// Talks to the Gmail API with one refresh token for the desk mailbox.
// Only application code uses this. No agent can reach it (G2).

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
type Header = { name: string; value: string };

const fromBase64Url = (data: string) => Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const toBase64Url = (text: string) => Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function findPart(part: Part, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) return fromBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

const stripHtml = (html: string) =>
  html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function parseGmailMessage(message: { id: string; payload: Part & { headers: Header[] } }): InboundMessage {
  const header = (name: string) => message.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const from = header("From").match(/<([^>]+)>/)?.[1] ?? header("From");
  const text = findPart(message.payload, "text/plain") ?? stripHtml(findPart(message.payload, "text/html") ?? "");

  // Gmail records whether the sender's domain vouched for this email.
  // Without that, anyone could pretend to be a recruiter.
  const results = message.payload.headers.filter((h) => h.name.toLowerCase() === "authentication-results").map((h) => h.value);
  const authenticated = results.some((value) => /mx\.google\.com/i.test(value) && /\bdmarc=pass\b/i.test(value));

  return { id: message.id, from: from.trim().toLowerCase(), subject: header("Subject"), text, authenticated };
}

// Removing line breaks stops a subject from adding extra mail headers.
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ").trim();

export function buildMime(from: string, message: OutboundMessage): string {
  return [
    `From: ${oneLine(from)}`,
    `To: ${oneLine(message.to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(oneLine(message.subject), "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(message.text, "utf8").toString("base64"),
  ].join("\r\n");
}

export function gmailFromEnv(): MailClient | null {
  const { DESK_MAILBOX, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!DESK_MAILBOX || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null;

  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID!,
        client_secret: GMAIL_CLIENT_SECRET!,
        refresh_token: GMAIL_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new Error(`Gmail sign-in failed (${response.status}). The refresh token may have expired.`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok) throw new Error(`Gmail request failed (${response.status}).`);
    return (await response.json()) as T;
  }

  return {
    address: DESK_MAILBOX.toLowerCase(),
    async listRecentIds() {
      const body = await call<{ messages?: { id: string }[] }>(`/messages?q=${encodeURIComponent("in:inbox newer_than:7d")}&maxResults=25`);
      return (body.messages ?? []).map((m) => m.id);
    },
    async get(id) {
      return parseGmailMessage(await call(`/messages/${encodeURIComponent(id)}?format=full`));
    },
    async send(message) {
      await call("/messages/send", { method: "POST", body: JSON.stringify({ raw: toBase64Url(buildMime(DESK_MAILBOX, message)) }) });
    },
  };
}
