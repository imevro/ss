CREATE SEQUENCE "public"."agent_session_number" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
DROP INDEX "agent_sessions_company_conversation";--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_gentic_key" ON "agent_sessions" USING btree ("gentic_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_company_conversation" ON "agent_sessions" USING btree ("company_id","conversation_id");--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "agent";--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "status";