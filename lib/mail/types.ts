export type InboundMessage = {
  id: string;
  from: string;
  subject: string;
  text: string;
  /** True only when the sender's domain proved the email is really theirs (DMARC). */
  authenticated: boolean;
};

export type OutboundMessage = { to: string; subject: string; text: string };

/** The desk mailbox. Gmail today; Microsoft Graph could replace it later (section 11.2). */
export type MailClient = {
  address: string;
  listRecentIds(): Promise<string[]>;
  get(id: string): Promise<InboundMessage>;
  send(message: OutboundMessage): Promise<void>;
};
