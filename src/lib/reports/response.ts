import { NextResponse } from 'next/server';
import { CONTENT_SECURITY_POLICY } from './design/shell';

/**
 * Send a report document. The policy inside the document is repeated as a
 * header, with a sandbox: opened in a tab of its own, the document still
 * cannot reach the app, and only this app may frame it.
 */
export function reportHtmlResponse(html: string): NextResponse {
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `${CONTENT_SECURITY_POLICY}; sandbox allow-scripts; frame-ancestors 'self'`,
    },
  });
}

export const renderMode = (value: string | null) => (value === 'print' ? 'print' : 'screen');
