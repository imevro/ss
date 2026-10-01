CREATE TABLE "ctx_steps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ctx_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" text NOT NULL,
	"company_id" text,
	"agent" text NOT NULL,
	"model" text,
	"tool_name" text NOT NULL,
	"kind" text DEFAULT 'running' NOT NULL,
	"explanation" text,
	"args_preview" text,
	"result_preview" text,
	"duration_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cached_tokens" integer,
	"cost_usd" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "ctx_steps_run_idx" ON "ctx_steps" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "ctx_steps_company_idx" ON "ctx_steps" USING btree ("company_id","created_at");