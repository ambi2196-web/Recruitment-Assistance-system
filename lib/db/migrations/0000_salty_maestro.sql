CREATE TYPE "public"."error_flag_status" AS ENUM('open', 'prompt_fixed');--> statement-breakpoint
CREATE TYPE "public"."requirement_status" AS ENUM('new', 'checked', 'clarifying', 'released', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'forwarded', 'rejected', 'interview', 'client_rejected', 'selected', 'no_reply');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('recruiter', 'stakeholder', 'admin');--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"redacted_input" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"user_id" integer,
	"linked_record_id" text,
	"success" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"requirement_id" integer NOT NULL,
	"version" integer NOT NULL,
	"json" jsonb NOT NULL,
	"what_changed" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"masked_resume_text" text NOT NULL,
	"resume_hash" text NOT NULL,
	"created_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"requirement_id" integer NOT NULL,
	"text_redacted" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"industry_label" text NOT NULL,
	CONSTRAINT "clients_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "error_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer NOT NULL,
	"line_ref" text NOT NULL,
	"note" text,
	"status" "error_flag_status" DEFAULT 'open' NOT NULL,
	"fixed_commit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	CONSTRAINT "prospect_terms_term_unique" UNIQUE("term")
);
--> statement-breakpoint
CREATE TABLE "requirement_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"requirement_id" integer NOT NULL,
	"json" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"original_text" text NOT NULL,
	"redacted_text" text NOT NULL,
	"status" "requirement_status" DEFAULT 'new' NOT NULL,
	"sourced_on_assumption" boolean DEFAULT false NOT NULL,
	"skip_reason" text,
	"created_by" integer NOT NULL,
	"assigned_recruiter_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_kits" (
	"id" serial PRIMARY KEY NOT NULL,
	"brief_id" integer NOT NULL,
	"json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"requirement_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"recruiter_id" integer NOT NULL,
	"call_notes" text,
	"call_notes_redacted" text,
	"draft_json" jsonb,
	"edited_summary" text,
	"flags_json" jsonb,
	"flag_resolutions_json" jsonb,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"stakeholder_decision" text,
	"reject_reason" text,
	"client_outcome" text,
	"outcome_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"hindi_toggle" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_answers" ADD CONSTRAINT "client_answers_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_answers" ADD CONSTRAINT "client_answers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_checks" ADD CONSTRAINT "requirement_checks_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_assigned_recruiter_id_users_id_fk" FOREIGN KEY ("assigned_recruiter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_kits" ADD CONSTRAINT "screening_kits_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_recruiter_id_users_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "briefs_requirement_version" ON "briefs" USING btree ("requirement_id","version");