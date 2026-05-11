-- Step 1: Drop FK on user_progress that references users.id (integer)
ALTER TABLE "user_progress" DROP CONSTRAINT IF EXISTS "user_progress_user_id_users_id_fk";
--> statement-breakpoint

-- Step 2: Recreate users table with new shape
-- (no data loss expected — auth was not wired up, users table is empty)
DROP TABLE "users";
--> statement-breakpoint

CREATE TABLE "users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "username" text UNIQUE,
  "email" text NOT NULL UNIQUE,
  "email_verified" timestamp,
  "image" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Step 3: Alter user_progress.user_id from integer to text
ALTER TABLE "user_progress" ALTER COLUMN "user_id" TYPE text USING user_id::text;
--> statement-breakpoint

-- Step 4: Re-add FK on user_progress
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Step 5: Add Auth.js accounts table
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
  CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY ("provider", "provider_account_id")
);
--> statement-breakpoint

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Step 6: Add Auth.js sessions table
CREATE TABLE "sessions" (
  "session_token" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "expires" timestamp NOT NULL
);
--> statement-breakpoint

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Step 7: Add Auth.js verification_tokens table
CREATE TABLE "verification_tokens" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp NOT NULL,
  CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY ("identifier", "token")
);
--> statement-breakpoint

-- Step 8: Add serial_admins table
CREATE TABLE "serial_admins" (
  "user_id" text NOT NULL,
  "serial_id" integer NOT NULL,
  "granted_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "serial_admins_user_id_serial_id_pk" PRIMARY KEY ("user_id", "serial_id")
);
--> statement-breakpoint

ALTER TABLE "serial_admins" ADD CONSTRAINT "serial_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "serial_admins" ADD CONSTRAINT "serial_admins_serial_id_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serials"("id") ON DELETE cascade ON UPDATE no action;
