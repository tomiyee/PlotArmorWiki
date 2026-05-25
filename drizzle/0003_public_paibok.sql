CREATE TABLE "chapter_synopsis_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"chapter_id" integer NOT NULL,
	"serial_id" integer NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"proposed_content" text NOT NULL,
	"citation" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_user_id" text,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "page_suggestion_infobox_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"suggestion_id" integer NOT NULL,
	"infobox_section_id" integer NOT NULL,
	"proposed_content" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_synopsis_suggestions" ADD CONSTRAINT "chapter_synopsis_suggestions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_synopsis_suggestions" ADD CONSTRAINT "chapter_synopsis_suggestions_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_synopsis_suggestions" ADD CONSTRAINT "chapter_synopsis_suggestions_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_synopsis_suggestions" ADD CONSTRAINT "chapter_synopsis_suggestions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_suggestion_infobox_changes" ADD CONSTRAINT "page_suggestion_infobox_changes_suggestion_id_page_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."page_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_suggestion_infobox_changes" ADD CONSTRAINT "page_suggestion_infobox_changes_infobox_section_id_page_infobox_sections_id_fk" FOREIGN KEY ("infobox_section_id") REFERENCES "public"."page_infobox_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_suggestion_infobox_changes_suggestion_id_infobox_section_id_index" ON "page_suggestion_infobox_changes" USING btree ("suggestion_id","infobox_section_id");