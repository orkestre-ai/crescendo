/**
 * DEPRECATED: This module is fully superseded by Vercel AI SDK.
 * - Streaming: streamText() + toUIMessageStreamResponse() in route handlers
 * - Tools: src/lib/ai/tools.ts (Zod-based tool definitions)
 * - Client: useChat from @ai-sdk/react
 * - Types: src/lib/ai-usage-types.ts (UsageData)
 *
 * This file is kept only as a deprecation marker. No code imports from it.
 * Safe to delete in a future cleanup.
 */

// Re-export UsageData from new location for any straggling references
export type { UsageData } from './ai-usage-types';
