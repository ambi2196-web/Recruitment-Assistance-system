CREATE TABLE "submission_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screening_kits" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "screening_kits" ADD COLUMN "prompt_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_actions" ADD CONSTRAINT "submission_actions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_actions" ADD CONSTRAINT "submission_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;