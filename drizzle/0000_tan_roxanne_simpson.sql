CREATE TYPE "public"."chapter_type" AS ENUM('Chapter', 'Episode', 'Issue', 'Part');--> statement-breakpoint
CREATE TYPE "public"."volume_type" AS ENUM('Volume', 'Season', 'Arc', 'Book');--> statement-breakpoint
CREATE TABLE "category_floater_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"label" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "category_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chapter_synopses" (
	"chapter_id" integer PRIMARY KEY NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"volume_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"idx" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_id" integer NOT NULL,
	"name" text NOT NULL,
	"body" text,
	"has_floater" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_floater_row_versions" (
	"page_id" integer NOT NULL,
	"floater_row_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	CONSTRAINT "page_floater_row_versions_page_id_floater_row_id_chapter_id_pk" PRIMARY KEY("page_id","floater_row_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "page_floater_versions" (
	"page_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"image_url" text,
	CONSTRAINT "page_floater_versions_page_id_chapter_id_pk" PRIMARY KEY("page_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "page_section_versions" (
	"page_id" integer NOT NULL,
	"section_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	CONSTRAINT "page_section_versions_page_id_section_id_chapter_id_pk" PRIMARY KEY("page_id","section_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"intro_chapter_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serial_authors" (
	"serial_id" integer NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "serial_authors_serial_id_display_order_pk" PRIMARY KEY("serial_id","display_order")
);
--> statement-breakpoint
CREATE TABLE "serials" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"splash_art_url" text,
	"chapter_type" "chapter_type" DEFAULT 'Chapter' NOT NULL,
	"volume_type" "volume_type" DEFAULT 'Volume' NOT NULL,
	CONSTRAINT "serials_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"user_id" integer NOT NULL,
	"serial_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_progress_user_id_serial_id_pk" PRIMARY KEY("user_id","serial_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "volumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"idx" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_floater_rows" ADD CONSTRAINT "category_floater_rows_category_id_page_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."page_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_sections" ADD CONSTRAINT "category_sections_category_id_page_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."page_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_synopses" ADD CONSTRAINT "chapter_synopses_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_categories" ADD CONSTRAINT "page_categories_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_floater_row_versions" ADD CONSTRAINT "page_floater_row_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_floater_row_versions" ADD CONSTRAINT "page_floater_row_versions_floater_row_id_category_floater_rows_id_fk" FOREIGN KEY ("floater_row_id") REFERENCES "public"."category_floater_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_floater_row_versions" ADD CONSTRAINT "page_floater_row_versions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_floater_versions" ADD CONSTRAINT "page_floater_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_floater_versions" ADD CONSTRAINT "page_floater_versions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_versions" ADD CONSTRAINT "page_section_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_versions" ADD CONSTRAINT "page_section_versions_section_id_category_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."category_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_versions" ADD CONSTRAINT "page_section_versions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_category_id_page_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."page_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_intro_chapter_id_chapters_id_fk" FOREIGN KEY ("intro_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_authors" ADD CONSTRAINT "serial_authors_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;