import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg(
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL!
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  // Create sample fundraising pages
  const pages = await Promise.all([
    prisma.fundraisingPage.create({
      data: {
        enPageId: 'TEST-001',
        name: 'Emergency Relief Fund',
        url: 'https://example.org/donate/emergency-relief',
        headline: 'Help Those in Need Today',
        metaDescription: 'Your donation makes a real difference in emergency relief efforts',
        ctaButtons: ['Donate Now', 'Give Monthly'],
        donationAmounts: [25, 50, 100, 250, 500],
        status: 'ACTIVE',
        lastScrapedAt: new Date(),
      },
    }),
    prisma.fundraisingPage.create({
      data: {
        enPageId: 'TEST-002',
        name: 'Education for All Campaign',
        url: 'https://example.org/donate/education',
        headline: 'Transform Lives Through Education',
        metaDescription: 'Support quality education for underprivileged children',
        ctaButtons: ['Support Education', 'Become a Monthly Donor'],
        donationAmounts: [15, 30, 60, 120, 240],
        status: 'ACTIVE',
        lastScrapedAt: new Date(),
      },
    }),
    prisma.fundraisingPage.create({
      data: {
        enPageId: 'TEST-003',
        name: 'Clean Water Initiative',
        url: 'https://example.org/donate/clean-water',
        headline: 'Bring Clean Water to Communities',
        metaDescription: 'Help provide access to safe, clean drinking water',
        ctaButtons: ['Donate', 'Join Our Mission'],
        donationAmounts: [20, 40, 80, 160, 320],
        status: 'ACTIVE',
        lastScrapedAt: new Date(),
      },
    }),
  ]);

  console.log(`Created ${pages.length} fundraising pages`);

  // Create performance snapshots for the last 30 days
  const today = new Date();
  const snapshots = [];

  for (const page of pages) {
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      // Generate realistic-looking metrics
      const pageViews = Math.floor(Math.random() * 1000) + 500;
      const conversions = Math.floor(pageViews * (Math.random() * 0.04 + 0.01)); // 1-5% conversion
      const avgDonation =
        page.donationAmounts[Math.floor(Math.random() * page.donationAmounts.length)];
      const revenue = conversions * avgDonation;
      const conversionRate = conversions / pageViews;
      const bounceRate = Math.random() * 0.4 + 0.3; // 30-70%

      snapshots.push({
        pageId: page.id,
        date,
        pageViews,
        bounceRate,
        conversions,
        revenue,
        avgSessionDuration: Math.random() * 180 + 60, // 60-240 seconds
        conversionRate,
        gaCollectedAt: new Date(),
        enCollectedAt: new Date(),
      });
    }
  }

  await prisma.performanceSnapshot.createMany({
    data: snapshots,
  });

  console.log(`Created ${snapshots.length} performance snapshots`);

  // Create sample recommendations
  const recommendations = await Promise.all([
    prisma.optimizationRecommendation.create({
      data: {
        pageId: pages[0].id,
        category: 'CONTENT',
        text: 'Consider testing a more urgent headline that emphasizes immediate impact, such as "Your Gift Today Provides Emergency Relief Within 48 Hours". Urgency-driven headlines typically increase conversion rates by 15-25%.',
        confidence: 0.85,
        modelUsed: 'claude-haiku-4-5-20251001',
        status: 'ACTIVE',
      },
    }),
    prisma.optimizationRecommendation.create({
      data: {
        pageId: pages[0].id,
        category: 'PRICING',
        text: 'Your donation amounts are well-structured, but consider adding a pre-selected default amount of $50 (your second-lowest option). Research shows that pre-selected amounts can increase average gift size by 10-20% without reducing conversion.',
        confidence: 0.75,
        modelUsed: 'claude-haiku-4-5-20251001',
        status: 'ACTIVE',
      },
    }),
    prisma.optimizationRecommendation.create({
      data: {
        pageId: pages[1].id,
        category: 'CTA',
        text: 'Your CTA "Become a Monthly Donor" could be more benefit-focused. Test "Join 5,000+ Monthly Supporters" to leverage social proof, which typically improves monthly conversion by 20-30%.',
        confidence: 0.8,
        modelUsed: 'claude-haiku-4-5-20251001',
        status: 'ACTIVE',
      },
    }),
    prisma.optimizationRecommendation.create({
      data: {
        pageId: pages[2].id,
        category: 'SOCIAL_PROOF',
        text: 'Add specific impact metrics near the donation form, such as "12,500 families now have access to clean water". Concrete numbers increase donor trust and can boost conversions by 15-25%.',
        confidence: 0.88,
        modelUsed: 'claude-haiku-4-5-20251001',
        status: 'ACTIVE',
      },
    }),
    prisma.optimizationRecommendation.create({
      data: {
        pageId: pages[2].id,
        category: 'TECHNICAL',
        text: 'Page load time analysis recommended. Based on bounce rate of 45%, ensure your page loads in under 3 seconds on mobile. Every additional second of load time can reduce conversions by 7%.',
        confidence: 0.7,
        modelUsed: 'claude-haiku-4-5-20251001',
        status: 'ACTIVE',
      },
    }),
  ]);

  console.log(`Created ${recommendations.length} optimization recommendations`);

  // Create a completed collection job
  const job = await prisma.collectionJob.create({
    data: {
      status: 'COMPLETED',
      triggeredBy: 'seed',
      totalPages: pages.length,
      processedPages: pages.length,
      progress: 100,
      phase: 'FINALIZING',
      startedAt: new Date(Date.now() - 600000), // 10 minutes ago
      completedAt: new Date(),
    },
  });

  console.log(`Created sample collection job: ${job.id}`);

  console.log('\nSeed completed successfully!');
  console.log(`- ${pages.length} fundraising pages`);
  console.log(`- ${snapshots.length} performance snapshots (30 days per page)`);
  console.log(`- ${recommendations.length} AI recommendations`);
  console.log(`- 1 collection job`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
