import { NextResponse } from 'next/server';
import { isNewerVersion } from '@/lib/version';
import {
  GITHUB_REPO_API_URL,
  VERSION_CACHE_TTL_MS,
} from '@/config/constants';

interface CachedRelease {
  tag: string;
  url: string;
  checkedAt: number;
}

let cachedRelease: CachedRelease | null = null;

/**
 * GET /api/version
 *
 * Returns the current app version and checks GitHub for a newer release.
 * Responses are cached in-memory for 1 hour (module-level variable).
 * Graceful degradation: if GitHub API is unreachable or returns non-200,
 * returns { currentVersion, updateAvailable: false } with no error.
 */
export async function GET() {
  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';

  // Dev: force the update banner visible for testing
  if (process.env.FORCE_UPDATE_BANNER === 'true') {
    return NextResponse.json({
      currentVersion,
      latestVersion: '99.0.0',
      updateAvailable: true,
      releaseUrl: GITHUB_REPO_API_URL.replace('api.github.com/repos', 'github.com') + '/releases',
    });
  }

  // Return cached if fresh
  if (
    cachedRelease &&
    Date.now() - cachedRelease.checkedAt < VERSION_CACHE_TTL_MS
  ) {
    return NextResponse.json({
      currentVersion,
      latestVersion: cachedRelease.tag,
      updateAvailable: isNewerVersion(cachedRelease.tag, currentVersion),
      releaseUrl: cachedRelease.url,
    });
  }

  try {
    const response = await fetch(
      `${GITHUB_REPO_API_URL}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        next: { revalidate: 0 },
      }
    );

    if (!response.ok) {
      // 404 = no releases yet, 403 = rate limited, any other = unexpected
      // Graceful degradation: return current version, no update info
      return NextResponse.json({ currentVersion, updateAvailable: false });
    }

    const data = await response.json();
    const tag = (data.tag_name as string)?.replace(/^v/, '') || '0.0.0';

    cachedRelease = {
      tag,
      url: data.html_url as string,
      checkedAt: Date.now(),
    };

    return NextResponse.json({
      currentVersion,
      latestVersion: tag,
      updateAvailable: isNewerVersion(tag, currentVersion),
      releaseUrl: cachedRelease.url,
    });
  } catch {
    // Network error: graceful degradation
    return NextResponse.json({ currentVersion, updateAvailable: false });
  }
}
