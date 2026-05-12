// DEPRECATED: Use src/lib/ai-client.ts instead.
// This file re-exports for backward compatibility during migration.
export {
  generateRecommendations,
  batchGenerateRecommendations,
  type RecommendationInput,
  type RecommendationCategory,
  type ParsedRecommendation,
} from './ai-client';
export { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '@/config/ai-defaults';

// Legacy class wrapper for any remaining callers
import {
  generateRecommendations as _generate,
  batchGenerateRecommendations as _batchGenerate,
} from './ai-client';
import type { RecommendationInput, ParsedRecommendation } from './ai-client';

export class ClaudeClient {
  async generateRecommendations(
    input: RecommendationInput,
    options?: {
      model?: string;
      systemPrompt?: string;
      userPromptTemplate?: string;
    }
  ): Promise<ParsedRecommendation[]> {
    return _generate(input, options);
  }
  async batchGenerateRecommendations(
    inputs: RecommendationInput[],
    options?: {
      model?: string;
      systemPrompt?: string;
      userPromptTemplate?: string;
    }
  ): Promise<Map<string, ParsedRecommendation[]>> {
    return _batchGenerate(inputs, options);
  }
}

export const claudeClient = new ClaudeClient();
