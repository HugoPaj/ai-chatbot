import 'dotenv/config';
import postgres from 'postgres';

type Action = 'list' | 'requeue-failed' | 'delete-failed' | 'delete-all';

async function main() {
  const action = (process.argv[2] as Action) || 'list';
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('POSTGRES_URL (or DATABASE_URL) is not set.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    // Ensure table exists
    const [{ to_regclass }] = await sql<{ to_regclass: string | null }[]>`
      select to_regclass('"DocumentProcessingJob"')
    `;
    if (!to_regclass) {
      console.error(
        'Table "DocumentProcessingJob" does not exist in this database.',
      );
      process.exit(1);
    }

    if (action === 'list') {
      const counts = await sql<{ status: string; cnt: string }[]>`
        select status, count(*) as cnt
        from "DocumentProcessingJob"
        group by status
        order by status
      `;
      console.table(counts);
      return;
    }

    if (action === 'requeue-failed') {
      const result = await sql`
        update "DocumentProcessingJob"
        set status = 'queued',
            progress = '0',
            "message" = 'Re-queued after setup',
            "updatedAt" = now()
        where status = 'failed'
        returning id
      `;
      console.log(`Re-queued ${result.length} failed job(s).`);
      return;
    }

    if (action === 'delete-failed') {
      const result = await sql`
        delete from "DocumentProcessingJob"
        where status = 'failed'
        returning id
      `;
      console.log(`Deleted ${result.length} failed job(s).`);
      return;
    }

    if (action === 'delete-all') {
      const result = await sql`
        delete from "DocumentProcessingJob" returning id
      `;
      console.log(`Deleted ${result.length} job(s) (all statuses).`);
      return;
    }

    console.error(`Unknown action: ${action}`);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
