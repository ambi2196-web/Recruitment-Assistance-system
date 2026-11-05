import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["recruiter", "stakeholder", "admin"]);

export const requirementStatus = pgEnum("requirement_status", [
  "new",
  "checked",
  "clarifying",
  "released",
  "active",
  "closed",
]);

export const submissionStatus = pgEnum("submission_status", [
  "draft",
  "submitted",
  "forwarded",
  "rejected",
  "interview",
  "client_rejected",
  "selected",
  "no_reply",
]);

export const errorFlagStatus = pgEnum("error_flag_status", ["open", "prompt_fixed"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull(),
  hindiToggle: boolean("hindi_toggle").notNull().default(false),
});

// Never sent to a model (FR-1.2).
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  industryLabel: text("industry_label").notNull(),
});

export const prospectTerms = pgTable("prospect_terms", {
  id: serial("id").primaryKey(),
  term: text("term").notNull().unique(),
});

export const requirements = pgTable("requirements", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  title: text("title").notNull(),
  // Holds real client names and rates. Limit access as in FR-1.6.
  originalText: text("original_text").notNull(),
  redactedText: text("redacted_text").notNull(),
  status: requirementStatus("status").notNull().default("new"),
  sourcedOnAssumption: boolean("sourced_on_assumption").notNull().default(false),
  skipReason: text("skip_reason"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  assignedRecruiterId: integer("assigned_recruiter_id").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const requirementChecks = pgTable("requirement_checks", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull().references(() => requirements.id),
  json: jsonb("json").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: createdAt(),
});

export const clientAnswers = pgTable("client_answers", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull().references(() => requirements.id),
  textRedacted: text("text_redacted").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const briefs = pgTable(
  "briefs",
  {
    id: serial("id").primaryKey(),
    requirementId: integer("requirement_id").notNull().references(() => requirements.id),
    version: integer("version").notNull(),
    json: jsonb("json").notNull(),
    whatChanged: jsonb("what_changed"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("briefs_requirement_version").on(t.requirementId, t.version)],
);

export const screeningKits = pgTable("screening_kits", {
  id: serial("id").primaryKey(),
  briefId: integer("brief_id").notNull().references(() => briefs.id),
  json: jsonb("json").notNull(),
  createdAt: createdAt(),
});

export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  // Both masked and redacted (FR-6.3).
  maskedResumeText: text("masked_resume_text").notNull(),
  resumeHash: text("resume_hash").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
});

export const submissions = pgTable("submissions", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull().references(() => requirements.id),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id),
  recruiterId: integer("recruiter_id").notNull().references(() => users.id),
  // May hold real rates and client names. Limit access as in FR-1.6.
  callNotes: text("call_notes"),
  callNotesRedacted: text("call_notes_redacted"),
  draftJson: jsonb("draft_json"),
  editedSummary: text("edited_summary"),
  flagsJson: jsonb("flags_json"),
  flagResolutionsJson: jsonb("flag_resolutions_json"),
  status: submissionStatus("status").notNull().default("draft"),
  stakeholderDecision: text("stakeholder_decision"),
  rejectReason: text("reject_reason"),
  clientOutcome: text("client_outcome"),
  outcomeReason: text("outcome_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const errorFlags = pgTable("error_flags", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  lineRef: text("line_ref").notNull(),
  note: text("note"),
  status: errorFlagStatus("status").notNull().default("open"),
  fixedCommit: text("fixed_commit"),
  createdAt: createdAt(),
});

// Who did what and when (G5, FR-3.5).
export const requirementActions = pgTable("requirement_actions", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull().references(() => requirements.id),
  userId: integer("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: createdAt(),
});

// One row per attempt at a model call (G9, FR-13.1).
export const aiCalls = pgTable("ai_calls", {
  id: serial("id").primaryKey(),
  agent: text("agent").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  redactedInput: text("redacted_input").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  latencyMs: integer("latency_ms").notNull().default(0),
  userId: integer("user_id").references(() => users.id),
  linkedRecordId: text("linked_record_id"),
  success: boolean("success").notNull(),
  error: text("error"),
  createdAt: createdAt(),
});
