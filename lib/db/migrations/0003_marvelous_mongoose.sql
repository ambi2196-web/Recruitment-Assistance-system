CREATE TABLE "weekly_digests" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"table_json" jsonb NOT NULL,
	"observations_json" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_flags" ADD COLUMN "requirement_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "error_flags" ADD COLUMN "agent" text NOT NULL;--> statement-breakpoint
ALTER TABLE "error_flags" ADD COLUMN "reported_by" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "forwarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "outcome_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "no_reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "error_flags" ADD CONSTRAINT "error_flags_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_flags" ADD CONSTRAINT "error_flags_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;