-- Create Org table
CREATE TABLE IF NOT EXISTS "Org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"domain" varchar(128) NOT NULL,
	"type" varchar DEFAULT 'university' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"maxUsersPerDay" varchar(16) DEFAULT '-1' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Org_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
-- Create OrgAdmin table
CREATE TABLE IF NOT EXISTS "OrgAdmin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"orgId" uuid NOT NULL,
	"canManageUsers" boolean DEFAULT true NOT NULL,
	"canViewAnalytics" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Safely drop subscription tables if they exist
DROP TABLE IF EXISTS "UserSubscription";--> statement-breakpoint
DROP TABLE IF EXISTS "SubscriptionPlan";--> statement-breakpoint
-- Add columns to User table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='orgId') THEN
        ALTER TABLE "User" ADD COLUMN "orgId" uuid;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='isVerified') THEN
        ALTER TABLE "User" ADD COLUMN "isVerified" boolean DEFAULT false NOT NULL;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='createdAt') THEN
        ALTER TABLE "User" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;
    END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraints safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='OrgAdmin_userId_User_id_fk') THEN
        ALTER TABLE "OrgAdmin" ADD CONSTRAINT "OrgAdmin_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='OrgAdmin_orgId_Org_id_fk') THEN
        ALTER TABLE "OrgAdmin" ADD CONSTRAINT "OrgAdmin_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='User_orgId_Org_id_fk') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
