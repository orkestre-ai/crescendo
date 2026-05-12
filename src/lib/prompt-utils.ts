/**
 * Replaces {{key}} placeholders in a template string with values from a vars map.
 * Keys not present in the map, or with null/undefined values, are replaced with empty string.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === null || value === undefined ? '' : String(value);
  });
}
