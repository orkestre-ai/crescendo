import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { SCREENSHOT_DIR } from '@/lib/screenshot-storage';

// Screenshots are written at runtime, and the production server only serves
// files that were in public/ when it started. next.config.js rewrites
// /screenshots/:file here so saved URLs keep working.
const FILENAME = /^[\w-]+\.png$/;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILENAME.test(file)) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const image = await readFile(path.join(SCREENSHOT_DIR, file));
    return new NextResponse(new Uint8Array(image), {
      headers: {
        'Content-Type': 'image/png',
        // Filenames include a timestamp, so a given URL never changes.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
