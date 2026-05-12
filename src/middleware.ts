import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { rootLogger } from '@/lib/logging';

const log = rootLogger.child({ module: 'middleware' });

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';

  const result = rateLimit(ip);

  if (!result.allowed) {
    log.warn(
      { ip, path: request.nextUrl.pathname, resetAt: result.resetAt },
      `Rate limited: ${ip} on ${request.nextUrl.pathname}`
    );
    return rateLimitResponse(result.resetAt);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
