/**
 * Analyze pages that failed scraping with ERR_BAD_REQUEST
 * These pages returned 400 when accessed with ?mode=DEMO
 *
 * Usage: npx tsx src/scripts/analyze-failed-pages.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Page IDs from the last sync errors (88 pages that failed with ERR_BAD_REQUEST)
const FAILED_PAGE_IDS = [
  'cmifn5mjt018p466oacybqut6',
  'cmifn5mlx018q466on09nlvpd',
  'cmifn5n3y018z466oc5zweb4e',
  'cmifn5nd20193466o0lmlv6r0',
  'cmifn5nf00194466oaghyeq8z',
  'cmifn5njl0196466ouh5xitwg',
  'cmifn5nrr019a466ocplu7cc1',
  'cmifn5oil019o466o4q4vs3fo',
  'cmifn5pen01a3466ogmztow31',
  'cmifn5pvv01ac466ouczohgzu',
  'cmifn5py001ad466otwy3g022',
  'cmifn5qcs01al466o6qylg9mr',
  'cmifn5qlf01aq466o46yvsizg',
  'cmifn5qmz01ar466o8y1fjhv7',
  'cmifn5scn01bm466o6osg7255',
  'cmifn5skn01bq466oykpgqu1n',
  'cmifn5smw01br466off0cogp8',
  'cmifn5spu01bt466ocacmyn38',
  'cmifn5stg01bv466osj4wz2oh',
  'cmifn5sx501bx466ojj3j4dkq',
  'cmifn5t3601c0466o73mlmx5p',
  'cmifn5t5e01c1466onvye4219',
  'cmifn5t8201c2466o8bp7am08',
  'cmifn5t9n01c3466oqao4zxu2',
  'cmifn5tb801c4466oe4nfxxlu',
  'cmifn5tcv01c5466ory832kbk',
  'cmifn5tkc01c9466oj8fkgtph',
  'cmifn5tm201ca466ocb0rnn17',
  'cmifn5to001cb466ohup8hzoj',
  'cmifn5tpw01cc466odr8t5504',
  'cmifn5tvr01cf466oxxdqp9gf',
  'cmifn5txw01cg466ocosvkz8w',
  'cmifn5u0501ch466oc47j8k8u',
  'cmifn5uah01cm466oab3h3fzr',
  'cmifn5ukn01cs466oyab7hnu0',
  'cmifn5utq01cw466ojo2ftcoz',
  'cmifn5v7i01d3466oh1tbr9t4',
  'cmifn5vfp01d7466oe5i38i6e',
  'cmifn5vki01da466of4bgvz85',
  'cmifn5vwp01dg466of48s8g9s',
  'cmifn5vyx01dh466o9jn77d74',
  'cmifn5w0s01di466od87v3tbh',
  'cmifn5w2z01dj466ouzd86q4b',
  'cmifn5w6x01dl466opdrx8fn8',
  'cmifn5w9501dm466o1c3sggce',
  'cmifn5wf301dp466ou9dqs30k',
  'cmifn5whd01dq466oz3rlys6k',
  'cmifn5wjr01dr466o7g9qbalw',
  'cmifn5wlt01ds466o2mxitd7i',
  'cmifn5wr501dv466o50i7gdig',
  'cmifn5wsv01dw466oboxaqbem',
  'cmifn5wup01dx466olsoztklu',
  'cmifn5wz801dz466o1w1d1dn5',
  'cmifn5x1h01e0466olgp7u3q6',
  'cmifn5x3e01e1466oh2uhwv1i',
  'cmifn5x5o01e2466omhqirqzc',
  'cmifn5x7j01e3466okof6d36n',
  'cmifn5x9l01e4466o1uv73dzw',
  'cmifn5xbe01e5466oeenlcr5r',
  'cmifn5xd201e6466opn2wmaak',
  'cmifn5xev01e7466oyf1ii1qh',
  'cmifn5xgi01e8466oagsibtqa',
  'cmifn5xi401e9466o3uxn6xh7',
  'cmifn5xjz01ea466oy64huy1q',
  'cmifn5xlx01eb466otlx3wpuk',
  'cmifn5xo301ec466owremw5ri',
  'cmifn5xpj01ed466odwsm981n',
  'cmifn5xr201ee466o0zf6dx2l',
  'cmifn5xsy01ef466o40fgec1g',
  'cmifn5xvx01eh466octhh5c29',
  'cmifn5y5201em466ow2abfgo0',
  'cmifn5y6g01en466o4ycpz15z',
  'cmifn5y7y01eo466ovb7bsocz',
  'cmifn5y9c01ep466oox25y9g4',
  'cmifn5yb901eq466ohdbno0mv',
  'cmifn5yd601er466o1a7eg5yc',
  'cmifn5yfa01es466okp6x9mtx',
  'cmifn5yhb01et466owrwsdkag',
  'cmifn5yjk01eu466oxa6cq12g',
  'cmifn5ylq01ev466oe90yvwnr',
  'cmifn5ynu01ew466oqfq03mwa',
  'cmifn5ypk01ex466ou4spu4nf',
  'cmifn5yrh01ey466o19ol24t2',
  'cmifn5ytm01ez466o9e0mcc4n',
  'cmifn5yvv01f0466o898hng6k',
  'cmifn5yxz01f1466ol4hoyzmt',
  'cmiii3o5200014694ntwdqx2p',
  'cmitc0zvy000146pgxqkoglgp',
];

async function main() {
  console.log('='.repeat(80));
  console.log('ANALYZING FAILED SCRAPING PAGES');
  console.log(`Total failed pages: ${FAILED_PAGE_IDS.length}`);
  console.log('='.repeat(80));

  // Fetch all failed pages
  const pages = await prisma.fundraisingPage.findMany({
    where: {
      id: { in: FAILED_PAGE_IDS },
    },
    select: {
      id: true,
      enPageId: true,
      name: true,
      campaignStatus: true,
      pageType: true,
      url: true,
      headline: true,
      lastSyncedAt: true,
      createdAt: true,
    },
  });

  console.log(`\nFound ${pages.length} pages in database\n`);

  // Group by campaignStatus
  const byStatus = new Map<string, typeof pages>();
  for (const page of pages) {
    const status = page.campaignStatus || 'null';
    if (!byStatus.has(status)) {
      byStatus.set(status, []);
    }
    byStatus.get(status)!.push(page);
  }

  console.log('-'.repeat(80));
  console.log('GROUPED BY CAMPAIGN STATUS');
  console.log('-'.repeat(80));
  for (const [status, statusPages] of byStatus.entries()) {
    console.log(`\n${status}: ${statusPages.length} pages`);
  }

  // Group by pageType
  const byType = new Map<string, typeof pages>();
  for (const page of pages) {
    const type = page.pageType || 'null';
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(page);
  }

  console.log('\n' + '-'.repeat(80));
  console.log('GROUPED BY PAGE TYPE');
  console.log('-'.repeat(80));
  for (const [type, typePages] of byType.entries()) {
    console.log(`\n${type}: ${typePages.length} pages`);
  }

  // Cross-tabulation: status x type
  console.log('\n' + '-'.repeat(80));
  console.log('CROSS-TABULATION: STATUS × TYPE');
  console.log('-'.repeat(80));
  const crossTab = new Map<string, number>();
  for (const page of pages) {
    const key = `${page.campaignStatus || 'null'} | ${page.pageType || 'null'}`;
    crossTab.set(key, (crossTab.get(key) || 0) + 1);
  }
  const sortedCross = [...crossTab.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sortedCross) {
    console.log(`  ${key}: ${count}`);
  }

  // Sample pages for each status
  console.log('\n' + '-'.repeat(80));
  console.log('SAMPLE PAGES (5 random)');
  console.log('-'.repeat(80));
  const sample = pages.sort(() => Math.random() - 0.5).slice(0, 5);
  for (const page of sample) {
    console.log(`\n  EN Page ID: ${page.enPageId}`);
    console.log(`  Name: ${page.name}`);
    console.log(`  Status: ${page.campaignStatus}`);
    console.log(`  Type: ${page.pageType}`);
    console.log(`  URL: ${page.url}`);
    console.log(`  Last Synced: ${page.lastSyncedAt || 'never'}`);
    console.log(`  Headline: ${page.headline || '(none)'}`);
  }

  // Check if any were previously scraped successfully
  const previouslyScraped = pages.filter((p) => p.lastSyncedAt !== null);
  console.log('\n' + '-'.repeat(80));
  console.log('PREVIOUSLY SCRAPED SUCCESSFULLY');
  console.log('-'.repeat(80));
  console.log(`  ${previouslyScraped.length} of ${pages.length} pages were scraped before`);

  if (previouslyScraped.length > 0) {
    console.log('\n  Sample of previously scraped pages:');
    for (const page of previouslyScraped.slice(0, 3)) {
      console.log(`    - ${page.name} (last synced: ${page.lastSyncedAt})`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`
Total failed pages: ${pages.length}
Unique statuses: ${byStatus.size}
Unique types: ${byType.size}
Previously scraped: ${previouslyScraped.length}

Most common combinations:
${sortedCross
  .slice(0, 3)
  .map(([k, v]) => `  - ${k}: ${v} pages`)
  .join('\n')}
`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
