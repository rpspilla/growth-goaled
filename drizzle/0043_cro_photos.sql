CREATE TABLE "cro_photos" (
	"cro_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cro_photos" ADD CONSTRAINT "cro_photos_cro_id_cro_profiles_id_fk" FOREIGN KEY ("cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE cascade ON UPDATE no action;