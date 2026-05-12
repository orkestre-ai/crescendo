import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ZodError } from 'zod';
import { isAppError, formatError } from './errors';
import { rootLogger } from '@/lib/logging';
import type { ErrorResponse } from '@/types';

export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(error: unknown, defaultMessage = 'An error occurred'): NextResponse {
  if (isAppError(error)) {
    const formatted = formatError(error);
    return NextResponse.json(
      {
        error: formatted.message,
        code: formatted.code,
        details: formatted.details,
      } as ErrorResponse,
      { status: formatted.statusCode }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      } as ErrorResponse,
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    const isProduction = process.env.NODE_ENV === 'production';
    rootLogger.error({ err: error, event: 'api.error' }, `API error: ${error.message}`);
    return NextResponse.json(
      {
        error: isProduction ? defaultMessage : error.message || defaultMessage,
        code: 'INTERNAL_ERROR',
      } as ErrorResponse,
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      error: defaultMessage,
      code: 'UNKNOWN_ERROR',
    } as ErrorResponse,
    { status: 500 }
  );
}

export async function handleApiRequest<T>(
  handler: () => Promise<T>,
  errorMessage?: string
): Promise<NextResponse> {
  try {
    const result = await handler();
    return successResponse(result);
  } catch (error) {
    rootLogger.error({ err: error instanceof Error ? error : new Error(String(error)), event: 'api.request.error' }, 'API request error');
    return errorResponse(error, errorMessage);
  }
}

export function validateCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    rootLogger.error({ event: 'cron.secret.missing' }, 'CRON_SECRET not configured');
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  if (!authHeader || authHeader.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

export function parseQueryParams(url: string): Record<string, string> {
  const { searchParams } = new URL(url);
  const params: Record<string, string> = {};

  searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return params;
}

export function parseIntParam(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function parseFloatParam(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export async function withErrorHandling<T>(fn: () => Promise<T>, context?: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (context) {
      rootLogger.error({ err: error instanceof Error ? error : new Error(String(error)), context }, `Error in ${context}`);
    }
    throw error;
  }
}

// Alias for backward compatibility
export const handleApiError = errorResponse;
