import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { rootLogger } from './logging';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR
  ? path.resolve(process.env.SCREENSHOT_DIR)
  : path.join(process.cwd(), 'public', 'screenshots');

/**
 * Upload a screenshot to the local filesystem.
 * Returns the public URL path of the screenshot.
 */
export async function uploadScreenshot(
  pageId: string,
  screenshot: Buffer,
  suffix: string = ''
): Promise<string | null> {
  const timestamp = Date.now();
  const filename = suffix ? `${pageId}-${timestamp}-${suffix}.png` : `${pageId}-${timestamp}.png`;

  try {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await writeFile(filepath, screenshot);
    return `/screenshots/${filename}`;
  } catch (error) {
    rootLogger.error({ err: error instanceof Error ? error : new Error(String(error)), pageId }, 'Failed to save screenshot');
    return null;
  }
}

/**
 * Delete a screenshot from the local filesystem.
 */
export async function deleteScreenshot(url: string): Promise<void> {
  if (url.startsWith('/screenshots/')) {
    try {
      const filename = url.replace('/screenshots/', '');
      const filepath = path.join(SCREENSHOT_DIR, filename);
      await unlink(filepath);
    } catch {
      // File may already be deleted — ignore
    }
  }
}
