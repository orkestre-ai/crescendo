import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { ReportInputField } from './inputs';
import { smokeTest } from './smoke-test';
import { yearEndGivingReview } from './year-end-giving-review';

export interface ReportDefinitionSeed {
  key: string;
  name: string;
  description: string;
  prompt: string;
  /** The form a person fills in to start the report. */
  inputs: ReportInputField[];
  enabledTools: string[];
  maxSteps: number;
  maxMinutes: number;
  /** False hides it from the list of reports a person can start. */
  enabled: boolean;
}

export const BUILTIN_REPORT_DEFINITIONS: ReportDefinitionSeed[] = [yearEndGivingReview, smokeTest];

/** The parts of a definition a person edits, and the code keeps current until they do. */
export const DEFINITION_CONTENT = [
  'name',
  'description',
  'prompt',
  'inputs',
  'enabledTools',
  'maxSteps',
  'maxMinutes',
] as const;

type Content = (typeof DEFINITION_CONTENT)[number];

/** A stored built-in, as far as keeping it current needs to see it. */
export type StoredBuiltin = {
  id: string;
  key: string;
  sortOrder: number;
  editedAt: Date | null;
} & {
  [field in Content]: unknown;
};

// As the database gives it back: no undefined, and the order of keys does not count.
const stored = (value: unknown) => JSON.parse(JSON.stringify(value));

/**
 * What to write so the stored built-ins match the code. A built-in nobody
 * has edited takes the code's current content; one a person has edited keeps
 * theirs. Whether it is enabled is the person's choice and is never changed.
 */
export function builtinDefinitionUpdates(
  seeds: ReportDefinitionSeed[],
  rows: StoredBuiltin[]
): { id: string; data: Partial<Record<Content | 'sortOrder', unknown>> }[] {
  const updates: ReturnType<typeof builtinDefinitionUpdates> = [];
  seeds.forEach((seed, i) => {
    const row = rows.find((r) => r.key === seed.key);
    if (!row) return;
    const data: Partial<Record<Content | 'sortOrder', unknown>> = {};
    if (row.sortOrder !== i) data.sortOrder = i;
    if (!row.editedAt) {
      for (const field of DEFINITION_CONTENT) {
        if (!isDeepStrictEqual(stored(row[field]), stored(seed[field]))) data[field] = seed[field];
      }
    }
    if (Object.keys(data).length > 0) updates.push({ id: row.id, data });
  });
  return updates;
}

/**
 * Seed the built-in definitions that are missing, by key, and bring the ones
 * nobody has edited up to the version in the code. A built-in a person has
 * edited is not overwritten.
 */
export async function ensureDefaultReportDefinitions(): Promise<void> {
  await prisma.reportDefinition.createMany({
    data: BUILTIN_REPORT_DEFINITIONS.map((definition, i) => ({
      ...definition,
      inputs: definition.inputs as unknown as Prisma.InputJsonValue,
      isDefault: true,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.reportDefinition.findMany({
    where: { isDefault: true, key: { in: BUILTIN_REPORT_DEFINITIONS.map((d) => d.key) } },
  });
  for (const { id, data } of builtinDefinitionUpdates(BUILTIN_REPORT_DEFINITIONS, rows)) {
    await prisma.reportDefinition.update({
      where: { id },
      data: data as Prisma.ReportDefinitionUpdateInput,
    });
  }
}
