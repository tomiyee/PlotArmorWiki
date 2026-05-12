CREATE TABLE "page_infobox_image_revisions" (
	"page_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"image_url" text,
	CONSTRAINT "page_infobox_image_revisions_page_id_chapter_id_pk" PRIMARY KEY("page_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "page_infobox_revisions" (
	"page_id" integer NOT NULL,
	"infobox_section_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"content" text,
	CONSTRAINT "page_infobox_revisions_page_id_infobox_section_id_chapter_id_pk" PRIMARY KEY("page_id","infobox_section_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "page_infobox_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"label" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "page_relationships" (
	"parent_page_id" integer NOT NULL,
	"child_page_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"is_active" boolean NOT NULL,
	CONSTRAINT "page_relationships_parent_page_id_child_page_id_chapter_id_pk" PRIMARY KEY("parent_page_id","child_page_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "page_section_revisions" (
	"page_id" integer NOT NULL,
	"section_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"content" text,
	CONSTRAINT "page_section_revisions_page_id_section_id_chapter_id_pk" PRIMARY KEY("page_id","section_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "page_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "page_titles" (
	"page_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "page_titles_page_id_chapter_id_pk" PRIMARY KEY("page_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "template_infobox_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"label" text NOT NULL,
	"display_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_id" integer NOT NULL,
	"name" text NOT NULL,
	"has_infobox" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_floater_rows" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category_sections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_categories" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_floater_row_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_floater_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_section_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_summaries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "category_floater_rows" CASCADE;--> statement-breakpoint
DROP TABLE "category_sections" CASCADE;--> statement-breakpoint
DROP TABLE "page_categories" CASCADE;--> statement-breakpoint
DROP TABLE "page_floater_row_versions" CASCADE;--> statement-breakpoint
DROP TABLE "page_floater_versions" CASCADE;--> statement-breakpoint
DROP TABLE "page_section_versions" CASCADE;--> statement-breakpoint
DROP TABLE "page_summaries" CASCADE;--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_category_id_page_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "serial_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "page_infobox_image_revisions" ADD CONSTRAINT "page_infobox_image_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_image_revisions" ADD CONSTRAINT "page_infobox_image_revisions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_revisions" ADD CONSTRAINT "page_infobox_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_revisions" ADD CONSTRAINT "page_infobox_revisions_infobox_section_id_page_infobox_sections_id_fk" FOREIGN KEY ("infobox_section_id") REFERENCES "public"."page_infobox_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_revisions" ADD CONSTRAINT "page_infobox_revisions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_sections" ADD CONSTRAINT "page_infobox_sections_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_relationships" ADD CONSTRAINT "page_relationships_parent_page_id_pages_id_fk" FOREIGN KEY ("parent_page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_relationships" ADD CONSTRAINT "page_relationships_child_page_id_pages_id_fk" FOREIGN KEY ("child_page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_relationships" ADD CONSTRAINT "page_relationships_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_revisions" ADD CONSTRAINT "page_section_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_revisions" ADD CONSTRAINT "page_section_revisions_section_id_page_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."page_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_revisions" ADD CONSTRAINT "page_section_revisions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_titles" ADD CONSTRAINT "page_titles_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_titles" ADD CONSTRAINT "page_titles_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_infobox_sections" ADD CONSTRAINT "template_infobox_sections_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sections" ADD CONSTRAINT "template_sections_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_serial_id_slug_idx" ON "pages" USING btree ("serial_id","slug");--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN "category_id";