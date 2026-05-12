/**
 * Version comparison utility for clean semver strings (X.Y.Z).
 * Hand-rolled to avoid depending on transitive semver package.
 */

/**
 * Returns true if `latest` is newer than `current`.
 * Handles clean semver strings (X.Y.Z). Strips leading 'v'.
 *
 * @param latest - Latest version string (e.g., "0.7.0" or "v0.7.0")
 * @param current - Current version string (e.g., "0.6.0")
 * @returns true if latest > current
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [lMaj = 0, lMin = 0, lPatch = 0] = parse(latest);
  const [cMaj = 0, cMin = 0, cPatch = 0] = parse(current);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
}

/** localStorage key for dismissed update version */
export const DISMISSED_VERSION_KEY = 'crescendo-update-dismissed-version';
