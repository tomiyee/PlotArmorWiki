ALTER TABLE "pages" ALTER COLUMN "intro_chapter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "is_home_page" boolean DEFAULT false NOT NULL;