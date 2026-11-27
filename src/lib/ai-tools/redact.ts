// An address written with "@" or with a percent-encoded "@" ("%40", or
// "%2540" when encoded twice), as it appears in a page path or query string.
// "%" is allowed before the "@" so an encoded local part goes with it.
const EMAIL_PATTERN = /[a-z0-9._%+-]+(?:@|%(?:25)*40)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

export const EMAIL_PLACEHOLDER = '[email removed]';

/**
 * Replace every email address inside the string values of `rows` with
 * `[email removed]` and count the replacements. The input is not changed.
 */
export function redactEmails<T>(rows: T[]): { rows: T[]; count: number } {
  let count = 0;

  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(EMAIL_PATTERN, () => {
        count++;
        return EMAIL_PLACEHOLDER;
      });
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
    }
    return value;
  };

  return { rows: rows.map(redact) as T[], count };
}
