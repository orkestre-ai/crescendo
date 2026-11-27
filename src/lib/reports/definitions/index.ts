import { prisma } from '@/lib/db';
import { smokeTest } from './smoke-test';

export interface ReportDefinitionSeed {
  key: string;
  name: string;
  description: string;
  prompt: string;
  enabledTools: string[];
  maxSteps: number;
  maxMinutes: number;
  /** False hides it from the list of reports a person can start. */
  enabled: boolean;
}

export const BUILTIN_REPORT_DEFINITIONS: ReportDefinitionSeed[] = [smokeTest];

/**
 * Seed the built-in definitions that are missing, by key. One that already
 * exists is left alone, so a built-in a person has edited is not overwritten.
 */
export async function ensureDefaultReportDefinitions(): Promise<void> {
  await prisma.reportDefinition.createMany({
    data: BUILTIN_REPORT_DEFINITIONS.map((definition, i) => ({
      ...definition,
      isDefault: true,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
}
