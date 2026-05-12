import { z } from 'zod';

const envSchema = z
  .object({
    // Database
    POSTGRES_URL: z.string().url(),
    POSTGRES_PRISMA_URL: z.string().url(),
    POSTGRES_URL_NON_POOLING: z.string().url(),

    // Engaging Networks REST API (optional — can be configured via Settings UI)
    EN_API_TOKEN: z.string().optional(),
    EN_BASE_URL: z.string().url().default('https://ca.engagingnetworks.app/ens/service'),

    // Engaging Networks Public API (optional - for NetDonor fundraising data)
    EN_PUBLIC_TOKEN: z.string().optional(),
    EN_REGION: z.enum(['us', 'ca']).default('ca'),

    // Google Analytics 4 (optional — can be configured via Settings UI)
    GA4_PROPERTY_ID: z
      .string()
      .regex(/^properties\/\d+$/, 'GA4_PROPERTY_ID must be in format properties/123456789')
      .optional(),
    GA4_SERVICE_ACCOUNT_KEY: z
      .string()
      .min(1)
      .transform((val) => {
        try {
          const parsed = JSON.parse(val);
          if (!parsed.type || !parsed.private_key || !parsed.client_email) {
            throw new Error('Invalid service account key format');
          }
          return parsed;
        } catch {
          throw new Error('GA4_SERVICE_ACCOUNT_KEY must be valid JSON');
        }
      })
      .optional(),

    // Anthropic Claude API
    ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-/).optional(),

    // App Configuration
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional(),
    SCREENSHOT_DIR: z.string().optional(),
    ENABLE_SCHEDULER: z.string().optional().default('true'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Debug: limit sync to N most-recently-modified pages (0 = no limit)
    SYNC_DEBUG_LIMIT: z.coerce.number().int().min(0).default(0),

    // Stealth Scraping (optional)
    REBROWSER_ENABLED: z.string().optional(),
    WEBSHARE_PROXY_HOST: z.string().optional(),
    WEBSHARE_PROXY_PORT: z.string().optional(),
    WEBSHARE_PROXY_USER: z.string().optional(),
    WEBSHARE_PROXY_PASS: z.string().optional(),
  })
  .refine(
    (data) => {
      const proxyVars = [
        data.WEBSHARE_PROXY_HOST,
        data.WEBSHARE_PROXY_PORT,
        data.WEBSHARE_PROXY_USER,
        data.WEBSHARE_PROXY_PASS,
      ];
      const setCount = proxyVars.filter(Boolean).length;
      return setCount === 0 || setCount === 4;
    },
    {
      message: 'All four WEBSHARE_PROXY_* variables must be set together (HOST, PORT, USER, PASS)',
    }
  );

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  // During Next.js build, env vars aren't available — return raw process.env
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return process.env as unknown as Env;
  }

  try {
    cachedEnv = envSchema.parse(process.env);
    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.issues
        .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`Invalid environment variables:\n${formatted}`);
    }
    throw error;
  }
}

// Validate on module load in production (skip during build)
if (
  typeof window === 'undefined' &&
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  validateEnv();
}

export const env = new Proxy({} as Env, {
  get(_, prop) {
    const validated = validateEnv();
    return validated[prop as keyof Env];
  },
});

export function isRebrowserEnabled(): boolean {
  return process.env.REBROWSER_ENABLED === 'true';
}

export function getProxyConfig(): { server: string; username: string; password: string } | null {
  const host = process.env.WEBSHARE_PROXY_HOST;
  const port = process.env.WEBSHARE_PROXY_PORT;
  const user = process.env.WEBSHARE_PROXY_USER;
  const pass = process.env.WEBSHARE_PROXY_PASS;

  if (!host || !port || !user || !pass) return null;

  return {
    server: `http://${host}:${port}`,
    username: user,
    password: pass,
  };
}
