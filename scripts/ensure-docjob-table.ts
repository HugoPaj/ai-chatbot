import 'dotenv/config';
import postgres from 'postgres';

const CREATE_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS "idx_doc_job_status" ON "DocumentProcessingJob" ("status");
CREATE INDEX IF NOT EXISTS "idx_doc_job_user" ON "DocumentProcessingJob" ("userId");
CREATE INDEX IF NOT EXISTS "idx_doc_job_created" ON "DocumentProcessingJob" ("createdAt");
`;

async function main() {
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('POSTGRES_URL or DATABASE_URL must be set.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [{ to_regclass }] = await sql<{ to_regclass: string | null }[]>`
      select to_regclass('DocumentProcessingJob')
    `;
    if (to_regclass) {
      console.log('DocumentProcessingJob already exists. No action taken.');
      return;
    }

    console.log('Creating DocumentProcessingJob table and indexes...');
    await sql.unsafe(CREATE_SQL);
    console.log('Done.');
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
