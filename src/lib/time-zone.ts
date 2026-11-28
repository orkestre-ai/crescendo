const DAY_MS = 86_400_000;

/** True for an IANA time zone name this runtime knows, such as "Europe/London". */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return timeZone.length > 0;
  } catch {
    return false;
  }
}

/** The day and time of day in a time zone, as YYYY-MM-DD and HH:MM. */
export function zonedClock(now: Date, timeZone: string): { day: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** A calendar day in a time zone, `daysBack` days before today there, as YYYY-MM-DD. */
export function zonedDate(now: Date, timeZone: string, daysBack = 0): string {
  const today = zonedClock(now, timeZone).day;
  return new Date(Date.parse(`${today}T00:00:00Z`) - daysBack * DAY_MS).toISOString().slice(0, 10);
}
