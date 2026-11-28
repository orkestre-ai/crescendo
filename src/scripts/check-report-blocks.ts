/**
 * Visual checks of the built-in report blocks, in Chromium. For every block:
 * nothing wider than a phone, a height above zero, text contrast of 4.5 to 1
 * or better in both themes, and on paper no taller than a Letter page unless
 * it is a table. Saves four pictures of each block for a person to look at.
 *
 *   npx tsx src/scripts/check-report-blocks.ts [--block <key>]
 *
 * Pictures go to logs/report-blocks/<key>-<desktop|phone|dark|print>.png.
 * Exits non-zero when any check fails. Needs no server and no database.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeBrowser } from '@/lib/playwright-scraper';
import { BUILTIN_BLOCKS } from '@/lib/reports/blocks/builtin';
import { checkBlockLayout, type ShotName } from '@/lib/reports/blocks/shots';
import { validateBlockDef } from '@/lib/reports/blocks/validate';

async function main(): Promise<number> {
  const at = process.argv.indexOf('--block');
  const only = at === -1 ? null : process.argv[at + 1];
  const blocks = only ? BUILTIN_BLOCKS.filter((block) => block.key === only) : BUILTIN_BLOCKS;
  if (blocks.length === 0) {
    console.error(
      `No built-in block "${only}". Blocks: ${BUILTIN_BLOCKS.map((b) => b.key).join(', ')}`
    );
    return 1;
  }

  const dir = join(process.cwd(), 'logs', 'report-blocks');
  mkdirSync(dir, { recursive: true });

  let failed = 0;
  for (const block of blocks) {
    const failures = validateBlockDef(block).map((issue) => `definition: ${issue.message}`);
    if (failures.length === 0) {
      const result = await checkBlockLayout(block, block.sampleData);
      failures.push(...result.failures);
      for (const [name, png] of Object.entries(result.shots) as [ShotName, Buffer][]) {
        writeFileSync(join(dir, `${block.key}-${name}.png`), png);
      }
    }
    console.log(`${failures.length === 0 ? 'ok  ' : 'FAIL'} ${block.key}`);
    for (const failure of failures) console.log(`       ${failure}`);
    if (failures.length > 0) failed++;
  }

  console.log(
    failed === 0
      ? `\n${blocks.length} block(s) pass. Pictures in ${dir}`
      : `\n${failed} of ${blocks.length} block(s) failed. Pictures in ${dir}`
  );
  return failed === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    return 1;
  })
  .then(async (code) => {
    await closeBrowser();
    process.exit(code);
  });
