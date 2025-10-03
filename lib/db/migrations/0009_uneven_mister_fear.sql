CREATE TABLE IF NOT EXISTS "DocumentProcessingJob" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"filename" varchar(256) NOT NULL,
	"fileSize" varchar(16) NOT NULL,
	"fileType" varchar(64) NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"progress" varchar(8) DEFAULT '0' NOT NULL,
	"message" text,
	"errorMessage" text,
	"r2Url" text,
	"contentHash" varchar(64),
	"totalPages" varchar(8),
	"chunksCount" varchar(8),
	"processingTimeMs" varchar(16),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"startedAt" timestamp,
	"completedAt" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentProcessingJob" ADD CONSTRAINT "DocumentProcessingJob_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
