CREATE TABLE "page_suggestion_section_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"suggestion_id" integer NOT NULL,
	"section_id" integer NOT NULL,
	"proposed_content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"target_chapter_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"citation" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_user_id" text,
	"review_note" text
);
--> statement-breakpoint
ALTER TABLE "page_suggestion_section_changes" ADD CONSTRAINT "page_suggestion_section_changes_suggestion_id_page_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."page_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_suggestion_section_changes" ADD CONSTRAINT "page_suggestion_section_changes_section_id_page_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."page_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_suggestions" ADD CONSTRAINT "page_suggestions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_suggestions" ADD CONSTRAINT "page_suggestions_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_suggestions" ADD CONSTRAINT "page_suggestions_target_chapter_id_chapters_id_fk" FOREIGN KEY ("target_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_suggestions" ADD CONSTRAINT "page_suggestions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_suggestion_section_changes_suggestion_id_section_id_index" ON "page_suggestion_section_changes" USING btree ("suggestion_id","section_id");