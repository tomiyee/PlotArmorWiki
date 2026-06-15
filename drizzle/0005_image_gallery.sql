CREATE TABLE "serial_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"artist" text,
	"spoiler_chapter_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serial_image_page_links" (
	"image_id" integer NOT NULL,
	"page_id" integer NOT NULL,
	CONSTRAINT "serial_image_page_links_image_id_page_id_pk" PRIMARY KEY("image_id","page_id")
);
--> statement-breakpoint
ALTER TABLE "page_infobox_image_revisions" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "page_infobox_image_revisions" ADD COLUMN "image_id" integer;--> statement-breakpoint
ALTER TABLE "serial_images" ADD CONSTRAINT "serial_images_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_images" ADD CONSTRAINT "serial_images_spoiler_chapter_id_chapters_id_fk" FOREIGN KEY ("spoiler_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_image_page_links" ADD CONSTRAINT "serial_image_page_links_image_id_serial_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."serial_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_image_page_links" ADD CONSTRAINT "serial_image_page_links_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_infobox_image_revisions" ADD CONSTRAINT "page_infobox_image_revisions_image_id_serial_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."serial_images"("id") ON DELETE no action ON UPDATE no action;
