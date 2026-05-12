# Multi-Provider Tool Use Compatibility

> Reference for AI provider tool calling behavior in Crescendo. Updated 2026-04-11.

## Overview

Crescendo uses the Vercel AI SDK (`streamText` + `tool()`) to route chat, explorations, and recommendations through multiple AI providers. The chat surface exposes 5 tools (GA4 query, org search, page performance, sitewide compare, snapshot compare) that the model can call autonomously during a conversation.

Tool use quality varies significantly across providers and models. This document captures known behavior to guide model selection and user expectations.

## How Tool Calling Works

### Server Side

```
chat/route.ts
  → streamText({ model, tools: allTools, stopWhen: stepCountIs(10) })
  → SDK sends tool definitions to the model
  → Model returns tool_call → SDK executes tool → loops result back
  → Repeats until model stops calling tools (up to 10 iterations)
  → toUIMessageStreamResponse() streams everything to client
```

### Client Side

```
ai-chat.tsx
  → useChat() receives UIMessage[] with parts array
  → extractToolEntries() finds parts with toolName/toolCallId/state
  → Renders tool activity in sidebar (name, params, result, status)
```

### What the User Sees

When a model uses tools, the chat UI shows:
- A wrench icon in the tool sidebar with the tool name
- Parameters the model sent (expandable)
- Tool result (summary + data, expandable)
- Status: running spinner → green checkmark (done) or red alert (error)

## Provider Compatibility Matrix

| Provider | Model | Tool Calling | Reliability | Notes |
|----------|-------|-------------|-------------|-------|
| **Anthropic** | Claude Sonnet 4.6 | Native | High | Proactively uses tools. Multi-step chains work reliably. Recommended for chat. |
| **Anthropic** | Claude Haiku 4.5 | Native | High | Faster, cheaper. Good for simple tool chains. |
| **Anthropic** | Claude Opus 4.6 | Native | High | Most capable but slowest and most expensive. |
| **OpenAI** | GPT-4o | Native | High | Strong tool calling. Compatible with all 5 tools. |
| **OpenAI** | GPT-4o-mini | Native | Medium-High | Generally reliable but may skip tools on simple questions. |
| **Google** | Gemini 2.5 Pro | Native | Medium-High | Supports function calling. May format results differently. |
| **Google** | Gemini 2.5 Flash | Native | Medium | Faster but less reliable with complex multi-tool chains. |
| **Ollama** | gemma4:31b (Q4_K_M) | Partial | Low-Medium | See Ollama section below. |
| **Ollama** | gemma4:latest (8B, Q4_K_M) | Partial | Low | Small model — often answers directly instead of calling tools. |
| **Ollama** | gemma3:27b (Q4_K_M) | Minimal | Very Low | Limited tool calling support in Gemma 3. |

## Ollama-Specific Considerations

### How Ollama Tool Calling Works

1. The `ollama-ai-provider-v2` package sends tool definitions in OpenAI-compatible format via Ollama's `/api/chat` endpoint
2. Ollama passes these to the model as part of the prompt
3. The model must emit a structured `tool_calls` JSON response for the SDK to recognize it
4. If the model outputs plain text instead of structured JSON, the SDK treats it as a normal text response (no tool call detected)

### Why Local Models May Not Use Tools

**Format mismatch**: Local models accessed through Ollama may not emit tool calls in the exact JSON structure the SDK expects. The model might "talk about" wanting to use a tool in natural language rather than producing the structured `tool_calls` format.

**Model training**: Models like Claude and GPT-4o are specifically fine-tuned for tool use with extensive RLHF on tool-calling scenarios. Open-weight models have varying levels of tool-calling training.

**Quantization impact**: Q4_K_M and similar quantization levels degrade structured output quality more than natural language fluency. A model that produces valid tool-call JSON at full precision may fail at 4-bit quantization.

**Model size**: Smaller models (7B-8B parameters) are significantly less reliable at structured output than larger ones (27B+). For tool use, prefer the largest model your hardware can run.

### Recommended Ollama Models for Tool Use

If tool calling is important and you want to use Ollama:

| Model | Parameters | Tool Quality | Notes |
|-------|-----------|-------------|-------|
| `qwen2.5:32b` | 32B | Medium | Known for strong structured output |
| `llama3.1:70b` | 70B | Medium-High | Good tool calling but requires ~40GB RAM |
| `mistral-large` | 123B | High | Best Ollama option but requires significant hardware |
| `gemma4:31b` | 31B | Low-Medium | Supports tools but inconsistent JSON output |

### Graceful Degradation

When a model doesn't use tools, the chat still works — the model answers from its training data and the system prompt context (page metrics, content, etc. are injected into the prompt). The user just won't see the tool sidebar activity, and answers won't include live data lookups.

## Model Selection Guidance

### By Surface

| Surface | Tool Use | Recommended Provider | Reasoning |
|---------|----------|---------------------|-----------|
| **Chat** | Heavy (5 tools, multi-step) | Anthropic or OpenAI | Tool reliability is critical for data-grounded answers |
| **Explorations** | Light (same tools, usually 1-2 calls) | Any provider | Simpler tool chains, more tolerant of skipped tools |
| **Recommendations** | None (uses `generateText`, no tools) | Any provider | No tool calling — model quality and cost are the main factors |

### Mixed Configuration

You can assign different providers per surface. A practical setup:

- **Chat**: Claude Sonnet 4.6 (reliable tools, fast enough for interactive use)
- **Explorations**: Gemma 4 31B on Ollama (free, good enough for guided analysis)
- **Recommendations**: Claude Haiku 4.5 (cheap, batch processing, no tools needed)

## Debugging Tool Use Issues

### Check if the model attempted tool calls

Look in `logs/dev-logs.json` for tool execution entries:
```bash
grep "tool" logs/dev-logs.json | tail -20
```

### Check the streamed response

In browser DevTools → Network tab, find the chat POST request and inspect the streamed response. Look for `tool-call` or `tool-result` data events. If none appear, the model didn't emit tool calls.

### Verify tools are being sent to the model

The chat route always passes `tools: allTools` to `streamText()`. If using a model that doesn't support tools, the SDK still sends them — the model just ignores them.

## Related Files

| File | Purpose |
|------|---------|
| `src/lib/ai/tools.ts` | 5 Zod-based tool definitions with `tool()` wrapper |
| `src/lib/ai/providers.ts` | Provider factory — creates model instances |
| `src/app/api/pages/[id]/chat/route.ts` | Chat streaming with tools |
| `src/components/page-detail/ai-chat.tsx` | Client-side tool rendering (`extractToolEntries`) |
| `src/config/ai-defaults.ts` | System prompts including tool instructions |
