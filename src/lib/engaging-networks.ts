import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { env } from '@/config/env';
import { createApiClientLogger } from '@/lib/logging/journeys';

const enLog = createApiClientLogger('en');

export class EngagingNetworksClient {
  private client: AxiosInstance;
  private authToken: string | null = null;
  private authenticating: Promise<string> | null = null;
  private apiToken: string;
  private baseUrl: string;

  constructor(apiToken?: string, baseUrl?: string) {
    this.apiToken = apiToken || env.EN_API_TOKEN || '';
    this.baseUrl = baseUrl || env.EN_BASE_URL;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    // Attach interceptors for auth and logging
    this.client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      // Skip auth for the authenticate call itself
      const skipAuth = (config as any)._skipAuth === true;

      // Add timing metadata
      (config as any)._startTime = performance.now();
      const method = (config.method || 'GET').toUpperCase();
      const urlPath = config.url || '';
      enLog.request(method, urlPath, config.params as Record<string, unknown>);

      if (!skipAuth) {
        await this.ensureAuthenticated();
        (config.headers as any) = (config.headers || {}) as any;
        (config.headers as any)['ens-auth-token'] = this.authToken as string;
      }

      return config;
    });

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const start = (response.config as any)._startTime as number | undefined;
        const duration = typeof start === 'number' ? performance.now() - start : 0;
        const endpoint = response.config.url || '';
        enLog.requestCompleted(endpoint, response.status, duration);
        return response;
      },
      async (error: AxiosError) => {
        type AugmentedConfig = InternalAxiosRequestConfig & {
          _retry?: boolean;
          _skipAuth?: boolean;
          _startTime?: number;
        };
        const config = (error.config || {}) as AugmentedConfig;
        const start = config?._startTime as number | undefined;
        const duration = typeof start === 'number' ? performance.now() - start : 0;
        const endpoint = config?.url || '';

        // 429 rate limit logging
        if (error.response?.status === 429) {
          const retryAfterHeader = error.response.headers?.['retry-after'];
          const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : 60;
          enLog.rateLimited(Number.isFinite(retryAfter) ? retryAfter : 60, endpoint);
        }

        // 401 unauthorized: try one re-auth then retry once
        // Skip retry for the authenticate call itself (_skipAuth) to avoid deadlock
        const isAuthCall = config?._skipAuth === true;
        const shouldRetry = error.response?.status === 401 && !config?._retry && !isAuthCall;
        if (shouldRetry) {
          try {
            await this.authenticate();
            config._retry = true;
            config._skipAuth = false;
            (config.headers as any) = (config.headers || {}) as any;
            (config.headers as any)['ens-auth-token'] = this.authToken as string;
            return this.client.request(config as InternalAxiosRequestConfig);
          } catch (reauthError) {
            enLog.authFailed(401, reauthError as Error);
          }
        }

        // Timeout logging
        if ((error as any).code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          enLog.slow(endpoint, duration);
        } else {
          enLog.requestFailed(endpoint, duration, error as Error, config?._retry ? 1 : 0);
        }

        return Promise.reject(error);
      }
    );
  }

  async fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: unknown) {
        if (error instanceof AxiosError && error.response?.status === 429 && i < maxRetries - 1) {
          // Exponential backoff with jitter
          const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  private async ensureAuthenticated(): Promise<string> {
    if (this.authToken) {
      return this.authToken;
    }
    return this.authenticate();
  }

  private async authenticate(): Promise<string> {
    if (this.authenticating) {
      return this.authenticating;
    }

    // Start authentication flow
    this.authenticating = (async () => {
      enLog.request('POST', '/authenticate');

      // EN API expects the token as a plain string body with Content-Type: application/json
      // Axios by default JSON-stringifies objects, but here we need the raw string
      const response = await this.client.post('/authenticate', this.apiToken, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        _skipAuth: true,
        transformRequest: [
          (data: string) => {
            // Return the token as-is (don't JSON.stringify it)
            return data;
          },
        ],
      } as any);

      // EN API returns JSON: {"expires":3600000,"ens-auth-token":"..."}
      const responseData = response.data;
      const token = responseData['ens-auth-token'] || responseData.token || responseData;

      if (!token || typeof token !== 'string') {
        enLog.authFailed(response.status ?? 0);
        throw new Error(`ENS authentication failed: Invalid token in response`);
      }

      const expiresMs = responseData.expires;
      const expiresMinutes = expiresMs ? Math.round(expiresMs / 60000) : undefined;
      enLog.authSuccess(expiresMinutes);

      this.authToken = token;
      return token;
    })();

    try {
      const token = await this.authenticating;
      return token;
    } finally {
      this.authenticating = null;
    }
  }

  async getPages(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ENPage[]> {
    const { type = 'nd', status = '', limit = 100, offset = 0 } = options;

    return this.fetchWithRetry(async () => {
      const response = await this.client.get('/page', {
        params: { type, status, limit, offset },
      });
      return response.data;
    });
  }

  async getPage(pageId: string): Promise<ENPageDetail> {
    return this.fetchWithRetry(async () => {
      const response = await this.client.get(`/page/${pageId}`);
      return response.data;
    });
  }

  async getPageMetrics(pageId: string, startDate: string, endDate: string): Promise<ENPageMetrics> {
    return this.fetchWithRetry(async () => {
      const response = await this.client.get(`/page/${pageId}/metrics`, {
        params: { startDate, endDate },
      });
      return response.data;
    });
  }
}

export interface ENPage {
  id: string;
  name: string;
  url: string;
  type: string;
  status: string;
  createdDate: string;
  modifiedDate: string;
}

export interface ENPageDetail {
  id: number;
  campaignId: number;
  name: string;
  title: string;
  type: string;
  subType: string;
  clientId: number;
  createdOn: number; // Unix timestamp
  modifiedOn: number; // Unix timestamp
  campaignBaseUrl: string;
  campaignStatus: string;
  defaultLocale: string;
  template: string;
  trackingParameters?: string[]; // Array of tracking parameter names (facebook, email, etc.)
  // Additional fields may exist
  url?: string;
  status?: string;
  createdDate?: string;
  modifiedDate?: string;
}

export interface ENPageMetrics {
  pageId: string;
  submissions: number;
  totalRevenue: number;
  avgDonation: number;
}

export const enClient = new EngagingNetworksClient();

/**
 * Factory function to create an EN client with a specific API token
 * Used by settings to test connection with a new token before saving
 */
export function createEngagingNetworksClient(
  apiToken: string,
  baseUrl?: string
): EngagingNetworksClient {
  return new EngagingNetworksClient(apiToken, baseUrl);
}

/**
 * Get an EN REST client using DB-stored credentials with env fallback.
 *
 * Use this instead of the `enClient` singleton when running in server
 * contexts that should respect Settings UI configuration.
 *
 * @returns EngagingNetworksClient or null if no token configured anywhere
 */
export async function getENRestClientAsync(): Promise<EngagingNetworksClient | null> {
  const { getEnApiKey } = await import('@/lib/settings');
  const apiKey = await getEnApiKey();
  if (!apiKey) return null;
  return new EngagingNetworksClient(apiKey);
}
