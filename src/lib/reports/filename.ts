import { runBlocks } from './blocks/resolve';
import type { ReportRun } from './types';

const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The organisation a report is for, as its title area names it. */
function organisationOf(run: ReportRun): string {
  const header = runBlocks(run.blocks).find((block) => block.block === 'report_header');
  const name = (header?.data as { organisation?: unknown } | undefined)?.organisation;
  return typeof name === 'string' ? name : '';
}

/**
 * The name of a downloaded file: <organisation>-<definition key>-<date>.<ext>,
 * the date being the day the run ended (or started) where the property is.
 */
export function reportFileName(run: ReportRun, ext: 'pdf' | 'html' | 'csv'): string {
  const at = run.completedAt ?? run.startedAt ?? run.createdAt;
  // en-CA writes a date as YYYY-MM-DD.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: run.timeZone ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const parts = [slug(organisationOf(run)), slug(run.definitionSnapshot.key), day];
  return `${parts.filter(Boolean).join('-')}.${ext}`;
}
