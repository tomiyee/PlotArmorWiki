CREATE TYPE "public"."chapter_type" AS ENUM('Chapter', 'Episode', 'Issue', 'Part');--> statement-breakpoint
CREATE TYPE "public"."volume_type" AS ENUM('Volume', 'Season', 'Arc', 'Book');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
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
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"intro_chapter_id" integer,
	"is_home_page" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serial_admins" (
	"user_id" text NOT NULL,
	"serial_id" integer NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "serial_admins_user_id_serial_id_pk" PRIMARY KEY("user_id","serial_id")
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
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
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
CREATE TABLE "user_progress" (
	"user_id" text NOT NULL,
	"serial_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_progress_user_id_serial_id_pk" PRIMARY KEY("user_id","serial_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"username" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "volumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"idx" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_synopses" ADD CONSTRAINT "chapter_synopses_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "pages" ADD CONSTRAINT "pages_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_intro_chapter_id_chapters_id_fk" FOREIGN KEY ("intro_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_admins" ADD CONSTRAINT "serial_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_admins" ADD CONSTRAINT "serial_admins_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_authors" ADD CONSTRAINT "serial_authors_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_infobox_sections" ADD CONSTRAINT "template_infobox_sections_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sections" ADD CONSTRAINT "template_sections_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_serial_id_slug_idx" ON "pages" USING btree ("serial_id","slug");