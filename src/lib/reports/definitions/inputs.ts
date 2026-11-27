import { z } from 'zod';
import { interpolateTemplate } from '@/lib/prompt-utils';
import type { DefinitionSnapshot } from '../types';

export const INPUT_TYPES = ['text', 'textarea', 'date', 'number', 'select'] as const;

/** One field of the form a person fills in to start a report. */
export interface ReportInputField {
  /** A single word: the prompt reads the value as {{key}}. */
  key: string;
  label: string;
  type: (typeof INPUT_TYPES)[number];
  required: boolean;
  /** Used when the field is left empty. May use {{today}} or {{year}}. */
  default?: string;
  /** The choices of a select. */
  options?: string[];
  help?: string;
}

/** What Crescendo fills into every prompt itself. */
export interface AutoVariables {
  /** Today where the property is, YYYY-MM-DD. */
  today: string;
  organizationName: string;
  timeZone: string;
  currency: string;
  preparedBy: string;
}

/**
 * The names a prompt may use without declaring an input. {{year}} is the
 * year of {{today}}.
 */
export const AUTO_VARIABLE_NAMES = [
  'today',
  'year',
  'organizationName',
  'timeZone',
  'currency',
  'preparedBy',
] as const;

const INPUT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;
const MAX_TEXT = 500;
const MAX_TEXTAREA = 5000;

const fieldSchema = z.object({
  key: z
    .string()
    .regex(INPUT_KEY, 'A key is one word: letters, digits and underscores, starting with a letter')
    .max(40),
  label: z.string().trim().min(1, 'Every field needs a label').max(100),
  type: z.enum(INPUT_TYPES),
  required: z.boolean(),
  default: z.string().max(MAX_TEXTAREA).optional(),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  help: z.string().max(500).optional(),
});

/** The input fields of a definition, as the API accepts and the database stores them. */
export const inputFieldsSchema = z
  .array(fieldSchema)
  .max(30)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, i) => {
      const issue = (message: string) => ctx.addIssue({ code: 'custom', message, path: [i] });
      if (seen.has(field.key)) issue(`Two fields have the key "${field.key}".`);
      seen.add(field.key);
      if ((AUTO_VARIABLE_NAMES as readonly string[]).includes(field.key)) {
        issue(`"${field.key}" is filled in by Crescendo and cannot be a field key.`);
      }
      if (field.type === 'select' && !field.options?.length) {
        issue(`The field "${field.key}" is a list and needs at least one choice.`);
      }
    });
  });

/** Stored input fields, read back. Anything that is not a valid list reads as no fields. */
export function parseInputFields(raw: unknown): ReportInputField[] {
  const parsed = inputFieldsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** The {{name}} variables a prompt uses. A figure token, {{fig:key}}, is not one. */
export function promptVariables(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]))];
}

/** The fields with {{today}} and {{year}} filled into their defaults. */
export function resolveInputDefaults(
  fields: ReportInputField[],
  today: string
): ReportInputField[] {
  return fields.map((field) =>
    field.default === undefined
      ? field
      : {
          ...field,
          default: interpolateTemplate(field.default, { today, year: today.slice(0, 4) }),
        }
  );
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Check what a person typed into the start form. An empty field takes its
 * default; a value for a field the definition does not have is dropped. The
 * values that come back have one entry per field, empty when left blank.
 */
export function validateRunInputs(
  fields: ReportInputField[],
  values: Record<string, string>
): { ok: true; values: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const out: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const typed = values[field.key];
    const value = (typeof typed === 'string' ? typed.trim() : '') || (field.default ?? '').trim();
    out[field.key] = value;

    if (!value) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }
    if (field.type === 'date' && !isRealDate(value)) {
      errors[field.key] = `${field.label} must be a date, as YYYY-MM-DD.`;
    } else if (field.type === 'number' && !Number.isFinite(Number(value))) {
      errors[field.key] = `${field.label} must be a number.`;
    } else if (field.type === 'select' && !field.options?.includes(value)) {
      errors[field.key] = `${field.label} must be one of: ${(field.options ?? []).join(', ')}.`;
    } else if (value.length > (field.type === 'textarea' ? MAX_TEXTAREA : MAX_TEXT)) {
      errors[field.key] = `${field.label} is too long.`;
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values: out };
}

/**
 * A definition's prompt with the person's inputs and Crescendo's own
 * variables filled in. Crescendo's variables win over an input of the same
 * name. A {{fig:key}} token is left as it is.
 */
export function buildReportPrompt(
  definition: DefinitionSnapshot,
  inputs: Record<string, string>,
  auto: AutoVariables
): string {
  return interpolateTemplate(definition.prompt, {
    ...inputs,
    ...auto,
    year: auto.today.slice(0, 4),
  });
}
