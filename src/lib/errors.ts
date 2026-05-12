import { rootLogger } from './logging';

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ExternalApiError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    super(`${service} API error: ${message}`, 'EXTERNAL_API_ERROR', 502, details);
    this.name = 'ExternalApiError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(`Database error: ${message}`, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class RateLimitError extends AppError {
  constructor(service: string, retryAfter?: number) {
    super(`Rate limit exceeded for ${service}`, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class CloudflareBlockedError extends AppError {
  constructor(url: string) {
    super(`Cloudflare challenge blocked access to ${url}`, 'CLOUDFLARE_BLOCKED', 403, { url });
    this.name = 'CloudflareBlockedError';
  }
}

export class JobProcessingError extends AppError {
  constructor(jobId: string, message: string, details?: unknown) {
    super(`Job ${jobId} processing error: ${message}`, 'JOB_PROCESSING_ERROR', 500, details);
    this.name = 'JobProcessingError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function formatError(error: unknown): {
  message: string;
  code: string;
  statusCode: number;
  details?: unknown;
} {
  if (isAppError(error)) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    };
  }

  return {
    message: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
  };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, onRetry } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }

      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

export function wrapAsync<T>(fn: (...args: any[]) => Promise<T>): (...args: any[]) => Promise<T> {
  return async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      rootLogger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Async function error');
      throw formatError(error);
    }
  };
}
