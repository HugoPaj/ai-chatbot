-- Create table for async document processing jobs
CREATE TABLE IF NOT EXISTS "DocumentProcessingJob" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL REFERENCES "User"("id"),
    "filename" varchar(256) NOT NULL,
    "fileSize" varchar(16) NOT NULL,
    "fileType" varchar(64) NOT NULL,
    "status" varchar DEFAULT 'queued' NOT NULL CHECK ("status" IN ('queued','processing','completed','failed')),
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

-- Helpful indexes for worker polling and status queries
CREATE INDEX IF NOT EXISTS "idx_doc_job_status" ON "DocumentProcessingJob" ("status");
CREATE INDEX IF NOT EXISTS "idx_doc_job_user" ON "DocumentProcessingJob" ("userId");
CREATE INDEX IF NOT EXISTS "idx_doc_job_created" ON "DocumentProcessingJob" ("createdAt");


