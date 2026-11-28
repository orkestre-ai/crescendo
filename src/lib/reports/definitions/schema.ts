import { z } from 'zod';
import { AVAILABLE_TOOLS } from '@/config/exploration-constants';
import { inputFieldsSchema } from './inputs';

// A report covers the whole site and its queries are run a second time, so
// only tools that need no page and take absolute dates are offered.
const REPORT_TOOL_KEYS = ['ga4_report', 'ga4_funnel', 'en_fundraising'];

/**
 * The data tools a definition may enable. The report tools (the ledger, the
 * blocks, notes and finishing) are always on and are not listed.
 */
export const REPORT_TOOL_CHOICES = AVAILABLE_TOOLS.filter((tool) =>
  REPORT_TOOL_KEYS.includes(tool.key)
);

export const DEFAULT_MAX_STEPS = 500;
export const DEFAULT_MAX_MINUTES = 120;
export const MAX_STEPS_LIMIT = 2000;
export const MAX_MINUTES_LIMIT = 720;

/** A daily schedule time, "HH:MM" from 00:00 to 23:59, in the Settings time zone. */
export const SCHEDULE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const fields = {
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().max(500),
  prompt: z.string().min(1, 'Prompt is required').max(100_000),
  inputs: inputFieldsSchema,
  enabledTools: z
    .array(z.enum(REPORT_TOOL_KEYS as [string, ...string[]]))
    .min(1, 'Choose at least one data tool'),
  maxSteps: z.number().int().min(1).max(MAX_STEPS_LIMIT),
  maxMinutes: z.number().int().min(1).max(MAX_MINUTES_LIMIT),
  enabled: z.boolean(),
  scheduleDailyAt: z
    .string()
    .regex(SCHEDULE_TIME, 'The daily time is HH:MM, from 00:00 to 23:59')
    .nullable(),
};

/** A new definition. What is left out takes the usual value. */
export const definitionCreateSchema = z.object({
  ...fields,
  description: fields.description.default(''),
  inputs: fields.inputs.default([]),
  maxSteps: fields.maxSteps.default(DEFAULT_MAX_STEPS),
  maxMinutes: fields.maxMinutes.default(DEFAULT_MAX_MINUTES),
  enabled: fields.enabled.default(true),
  scheduleDailyAt: fields.scheduleDailyAt.optional(),
});

/** A change to a definition: only what is given is changed. */
export const definitionUpdateSchema = z.object(fields).partial();

/** A key for a new definition, from its name: "Spring appeal" gives "spring-appeal". */
export function definitionKey(name: string): string {
  const key = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key || 'report';
}
