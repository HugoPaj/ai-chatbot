import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('POSTGRES_URL (or DATABASE_URL) is not set.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const exists = await sql<{ to_regclass: string | null }[]>`
      select to_regclass('"DocumentProcessingJob"')
    `;
    const reg = exists[0]?.to_regclass;
    console.log('DocumentProcessingJob exists:', Boolean(reg));

    if (reg) {
      const rows = await sql<{ count: string }[]>`
        select count(*) from "DocumentProcessingJob"
      `;
      console.log('Row count:', rows[0]?.count ?? '0');
      const statuses = await sql<{ status: string; cnt: string }[]>`
        select status, count(*) as cnt
        from "DocumentProcessingJob"
        group by status
        order by status
      `;
      console.table(statuses);
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
