CREATE TABLE "inbound_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" text,
	"requirement_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "reminder_emailed_day" integer;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE no action ON UPDATE no action;