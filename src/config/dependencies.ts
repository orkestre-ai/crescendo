/**
 * Curated list of key dependencies for the About dialog's Acknowledgements tab.
 * Subset of production dependencies — "key" means user-visible or architecturally central.
 */

export interface DependencyInfo {
  name: string;
  description: string;
  license: string;
  url: string;
  sponsorUrl?: string;
}

export const KEY_DEPENDENCIES: DependencyInfo[] = [
  {
    name: 'Next.js',
    description: 'React framework for production',
    license: 'MIT',
    url: 'https://nextjs.org',
    sponsorUrl: 'https://github.com/sponsors/vercel',
  },
  {
    name: 'React',
    description: 'Library for building user interfaces',
    license: 'MIT',
    url: 'https://react.dev',
  },
  {
    name: 'Prisma',
    description: 'Next-generation ORM for Node.js and TypeScript',
    license: 'Apache-2.0',
    url: 'https://prisma.io',
    sponsorUrl: 'https://github.com/sponsors/prisma',
  },
  {
    name: 'Tailwind CSS',
    description: 'Utility-first CSS framework',
    license: 'MIT',
    url: 'https://tailwindcss.com',
    sponsorUrl: 'https://github.com/sponsors/tailwindlabs',
  },
  {
    name: 'shadcn/ui',
    description: 'Accessible UI components built on Radix UI',
    license: 'MIT',
    url: 'https://ui.shadcn.com',
  },
  {
    name: 'Radix UI',
    description: 'Unstyled, accessible UI primitives',
    license: 'MIT',
    url: 'https://radix-ui.com',
    sponsorUrl: 'https://github.com/sponsors/radix-ui',
  },
  {
    name: 'Vercel AI SDK',
    description: 'Multi-provider AI integration toolkit',
    license: 'Apache-2.0',
    url: 'https://sdk.vercel.ai',
  },
  {
    name: 'Playwright',
    description: 'Browser automation for web scraping',
    license: 'Apache-2.0',
    url: 'https://playwright.dev',
  },
  {
    name: 'Recharts',
    description: 'Composable charting library for React',
    license: 'MIT',
    url: 'https://recharts.org',
  },
  {
    name: 'Zod',
    description: 'TypeScript-first schema validation',
    license: 'MIT',
    url: 'https://zod.dev',
    sponsorUrl: 'https://github.com/sponsors/colinhacks',
  },
  {
    name: 'Lucide',
    description: 'Beautiful and consistent icon library',
    license: 'ISC',
    url: 'https://lucide.dev',
    sponsorUrl: 'https://github.com/sponsors/lucide-icons',
  },
  {
    name: 'date-fns',
    description: 'Modern JavaScript date utility library',
    license: 'MIT',
    url: 'https://date-fns.org',
    sponsorUrl: 'https://github.com/sponsors/kossnocorp',
  },
  {
    name: 'Axios',
    description: 'Promise-based HTTP client',
    license: 'MIT',
    url: 'https://axios-http.com',
  },
  {
    name: 'PostgreSQL',
    description: 'Advanced open-source relational database',
    license: 'PostgreSQL',
    url: 'https://postgresql.org',
    sponsorUrl: 'https://www.postgresql.org/about/donate/',
  },
  {
    name: 'pino',
    description: 'Super fast Node.js logger',
    license: 'MIT',
    url: 'https://getpino.io',
    sponsorUrl: 'https://github.com/sponsors/pinojs',
  },
];
