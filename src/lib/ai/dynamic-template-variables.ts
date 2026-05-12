import { getPreviousToolResult } from './previous-tool-result';

const PREVIOUS_TOOL_RESULT_RE = /\{\{previousToolResult:(\w+)\}\}/g;
const NO_PRIOR_TEXT = '(no previous run — this is the first audit for this page)';

type Resolver = (pageId: string, explorationId: string, toolName: string) => Promise<unknown | null>;

/**
 * Substitutes {{previousToolResult:TOOL_NAME}} tokens with JSON-stringified prior tool results.
 * Runs as a prepass before the sync interpolateTemplate; any unknown tool name (or a null
 * result) gets a human-readable fallback string.
 *
 * @param resolver injectable for tests; defaults to the real getPreviousToolResult.
 */
export async function resolveDynamicVariables(
  template: string,
  ctx: { pageId: string; explorationId: string },
  resolver: Resolver = getPreviousToolResult
): Promise<string> {
  const tokens = [...template.matchAll(PREVIOUS_TOOL_RESULT_RE)];
  if (tokens.length === 0) return template;

  const uniqueTools = Array.from(new Set(tokens.map((m) => m[1])));
  const resolved = new Map<string, string>();
  await Promise.all(
    uniqueTools.map(async (tool) => {
      const result = await resolver(ctx.pageId, ctx.explorationId, tool);
      if (result === null || result === undefined) {
        resolved.set(tool, NO_PRIOR_TEXT);
      } else {
        resolved.set(tool, JSON.stringify(result));
      }
    })
  );
  return template.replace(PREVIOUS_TOOL_RESULT_RE, (_, tool: string) => resolved.get(tool) ?? NO_PRIOR_TEXT);
}
