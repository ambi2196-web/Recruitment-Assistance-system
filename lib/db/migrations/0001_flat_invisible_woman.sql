CREATE TABLE "requirement_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"requirement_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "prompt_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "requirement_actions" ADD CONSTRAINT "requirement_actions_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_actions" ADD CONSTRAINT "requirement_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;