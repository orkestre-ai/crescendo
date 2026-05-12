/**
 * One-off probe: dump shape of EN /page list rows and one /page/{id} detail,
 * to see which URL fields are actually populated in this instance.
 *
 * Usage: npx tsx src/scripts/inspect-en-page.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { enClient } = await import('@/lib/engaging-networks');

  const list = await enClient.getPages({ type: 'nd', status: '', limit: 5 });
  console.log(`\n=== List endpoint (${list.length} rows) ===`);
  for (const row of list) {
    console.log(JSON.stringify(row));
  }

  if (list.length === 0) {
    console.log('No rows returned — cannot fetch details.');
    process.exit(0);
  }

  console.log(`\n=== Detail endpoint for first ID ${list[0].id} ===`);
  const detail = await enClient.getPage(String(list[0].id));
  console.log(JSON.stringify(detail, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
