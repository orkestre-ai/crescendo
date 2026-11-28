import { NextResponse } from 'next/server';
import { CONTENT_SECURITY_POLICY } from './design/shell';

/** The header that makes a response a file to save. File names here are plain ASCII. */
export const attachment = (fileName: string) => ({
  'Content-Disposition': `attachment; filename="${fileName}"`,
});

/**
 * Send a report document. The policy inside the document is repeated as a
 * header, with a sandbox: opened in a tab of its own, the document still
 * cannot reach the app, and only this app may frame it. With a file name,
 * the same document is sent as a download.
 */
export function reportHtmlResponse(html: string, fileName?: string): NextResponse {
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `${CONTENT_SECURITY_POLICY}; sandbox allow-scripts; frame-ancestors 'self'`,
      ...(fileName ? attachment(fileName) : {}),
    },
  });
}

export const renderMode = (value: string | null) => (value === 'print' ? 'print' : 'screen');
