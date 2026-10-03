CREATE TABLE "user_onboarding" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal" jsonb,
	"status" text DEFAULT 'started' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_onboarding_user" ON "user_onboarding" USING btree ("user_id");