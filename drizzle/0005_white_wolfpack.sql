CREATE TABLE "serial_searchable_infobox_labels" (
	"serial_id" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "serial_searchable_infobox_labels_serial_id_label_pk" PRIMARY KEY("serial_id","label")
);
--> statement-breakpoint
ALTER TABLE "serial_searchable_infobox_labels" ADD CONSTRAINT "serial_searchable_infobox_labels_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE no action ON UPDATE no action;