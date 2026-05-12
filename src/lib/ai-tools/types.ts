export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolSkill {
  schema: ToolSchema;
  instructions: string;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  data: unknown;
  summary: string;
  error?: string;
}
