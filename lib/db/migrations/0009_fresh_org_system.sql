-- Fresh deployment migration for organization system
-- This migration works on completely clean databases

-- Create Organizations table
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

-- Create Organization Admins table
CREATE TABLE IF NOT EXISTS "OrgAdmin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"orgId" uuid NOT NULL,
	"canManageUsers" boolean DEFAULT true NOT NULL,
	"canViewAnalytics" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

-- Ensure User table has organization columns
DO $$
BEGIN
    -- Add orgId column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='orgId') THEN
        ALTER TABLE "User" ADD COLUMN "orgId" uuid;
    END IF;

    -- Add isVerified column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='isVerified') THEN
        ALTER TABLE "User" ADD COLUMN "isVerified" boolean DEFAULT false NOT NULL;
    END IF;

    -- Add createdAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='createdAt') THEN
        ALTER TABLE "User" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;
    END IF;
END $$;

-- Add foreign key constraints
DO $$
BEGIN
    -- OrgAdmin -> User foreign key
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='OrgAdmin_userId_User_id_fk') THEN
        ALTER TABLE "OrgAdmin" ADD CONSTRAINT "OrgAdmin_userId_User_id_fk"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE no action ON UPDATE no action;
    END IF;

    -- OrgAdmin -> Org foreign key
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='OrgAdmin_orgId_Org_id_fk') THEN
        ALTER TABLE "OrgAdmin" ADD CONSTRAINT "OrgAdmin_orgId_Org_id_fk"
        FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE no action ON UPDATE no action;
    END IF;

    -- User -> Org foreign key
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='User_orgId_Org_id_fk') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_orgId_Org_id_fk"
        FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE no action ON UPDATE no action;
    END IF;
END $$;