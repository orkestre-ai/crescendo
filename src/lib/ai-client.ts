import { generateText } from 'ai';
import { getProviderConfig, getProviderModel } from '@/lib/ai/providers';
import { createApiClientLogger } from '@/lib/logging/journeys';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '@/config/ai-defaults';

// Re-export defaults for backwards compatibility
export { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE };

const aiLog = createApiClientLogger('claude');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationCategory =
  | 'CONTENT'
  | 'DESIGN'
  | 'PRICING'
  | 'CTA'
  | 'TECHNICAL'
  | 'SOCIAL_PROOF';

export interface RecommendationInput {
  pageUrl: string;
  pageContent: {
    h1: string | null;
    description: string | null;
    cta: string[];
    donationAmounts: number[];
    appealText?: string | null;
  };
  metrics: {
    pageViews: number;
    conversionRate: number;
    bounceRate: number;
    revenue: number;
  };
  historicalData?: {
    avgConversionRate: number;
    trend: 'improving' | 'declining' | 'stable';
  };
}

export interface ParsedRecommendation {
  category: RecommendationCategory;
  text: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateRecommendations(
  input: RecommendationInput,
  options?: { systemPrompt?: string; userPromptTemplate?: string }
): Promise<ParsedRecommendation[]> {
  const config = await getProviderConfig('recs');
  if (!config.apiKey && config.provider !== 'ollama') {
    throw new Error(
      `No API key configured for ${config.provider}. Go to Settings to add one.`
    );
  }
  const model = getProviderModel(
    config.provider,
    config.modelId,
    config.apiKey,
    config.baseUrl
  );

  const systemPrompt = options?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const prompt = options?.userPromptTemplate
    ? buildTemplatedPrompt(input, options.userPromptTemplate)
    : buildLegacyPrompt(input);

  const start = performance.now();
  aiLog.request('POST', '/generateText', { model: config.modelId, provider: config.provider, promptLength: prompt.length });

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt,
    temperature: 0.7,
    maxOutputTokens: 1024,
  });

  const durationMs = performance.now() - start;
  const recommendations = parseRecommendations(text);
  aiLog.requestCompleted('/generateText', 200, durationMs);
  return recommendations;
}

export async function batchGenerateRecommendations(
  inputs: RecommendationInput[],
  options?: { systemPrompt?: string; userPromptTemplate?: string }
): Promise<Map<string, ParsedRecommendation[]>> {
  const results = new Map<string, ParsedRecommendation[]>();

  for (const input of inputs) {
    try {
      const recommendations = await generateRecommendations(input, options);
      results.set(input.pageUrl, recommendations);

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      aiLog.requestFailed('/generateText', 0, error as Error);
      results.set(input.pageUrl, []);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

function buildTemplatedPrompt(
  input: RecommendationInput,
  template: string
): string {
  const historicalContext = input.historicalData
    ? `\nHistorical Context:\n- Average Conversion Rate: ${(input.historicalData.avgConversionRate * 100).toFixed(2)}%\n- Performance Trend: ${input.historicalData.trend}`
    : '';

  return template
    .replace('{{pageUrl}}', input.pageUrl)
    .replace('{{headline}}', input.pageContent.h1 || 'Not available')
    .replace(
      '{{metaDescription}}',
      input.pageContent.description || 'Not available'
    )
    .replace(
      '{{ctaButtons}}',
      input.pageContent.cta.length > 0
        ? input.pageContent.cta.join(', ')
        : 'Not available'
    )
    .replace(
      '{{donationAmounts}}',
      input.pageContent.donationAmounts.length > 0
        ? '$' + input.pageContent.donationAmounts.join(', $')
        : 'Not available'
    )
    .replace(
      '{{appealText}}',
      input.pageContent.appealText
        ? `- Appeal Text: "${input.pageContent.appealText.substring(0, 1000)}"`
        : ''
    )
    .replace('{{pageViews}}', String(input.metrics.pageViews))
    .replace(
      '{{conversionRate}}',
      (input.metrics.conversionRate * 100).toFixed(2)
    )
    .replace('{{bounceRate}}', (input.metrics.bounceRate * 100).toFixed(2))
    .replace('{{revenue}}', input.metrics.revenue.toFixed(2))
    .replace('{{historicalContext}}', historicalContext);
}

function buildLegacyPrompt(input: RecommendationInput): string {
  const historicalContext = input.historicalData
    ? `\nHistorical Context:
- Average Conversion Rate: ${(input.historicalData.avgConversionRate * 100).toFixed(2)}%
- Performance Trend: ${input.historicalData.trend}`
    : '';

  return `You are an expert in conversion rate optimization (CRO) for nonprofit fundraising pages. Analyze the following page and provide 3-5 specific, actionable recommendations to improve conversion rate.

Page: ${input.pageUrl}

Current Content:
- Headline: "${input.pageContent.h1 || 'Not available'}"
- Meta Description: "${input.pageContent.description || 'Not available'}"
- Call-to-Action Buttons: ${input.pageContent.cta.length > 0 ? input.pageContent.cta.join(', ') : 'Not available'}
- Donation Amounts: $${input.pageContent.donationAmounts.length > 0 ? input.pageContent.donationAmounts.join(', $') : 'Not available'}
${input.pageContent.appealText ? `- Appeal Text: "${input.pageContent.appealText.substring(0, 1000)}"` : ''}

Current Performance:
- Page Views: ${input.metrics.pageViews}
- Conversion Rate: ${(input.metrics.conversionRate * 100).toFixed(2)}%
- Bounce Rate: ${(input.metrics.bounceRate * 100).toFixed(2)}%
- Revenue: $${input.metrics.revenue.toFixed(2)}${historicalContext}

Provide 3-5 specific recommendations. Focus on high-impact, testable changes. Reference specific metrics and benchmarks. Be concise but specific.

IMPORTANT: Output ONLY lines in this exact pipe-delimited format, one per line, nothing else — no markdown, no headers, no bullets, no preamble:
CATEGORY | 0.85 | Your recommendation text here

Valid categories: CONTENT, DESIGN, PRICING, CTA, TECHNICAL, SOCIAL_PROOF

Example output:
CONTENT | 0.85 | Consider testing a more urgent headline that emphasizes immediate impact. Urgency-driven headlines typically increase conversion rates by 15-25%.
CTA | 0.78 | Replace generic "Donate" button with specific impact-driven text like "Feed a Family Today". Specific CTAs improve click-through by 10-20%.`;
}

// ---------------------------------------------------------------------------
// Parsers (copied from claude.ts -- all 3 fallback strategies)
// ---------------------------------------------------------------------------

function parseRecommendations(text: string): ParsedRecommendation[] {
  // Try strict pipe-delimited format first
  const recommendations = parsePipeFormat(text);

  if (recommendations.length > 0) {
    return recommendations;
  }

  // Fallback: extract from markdown-formatted responses
  aiLog.raw.warn(
    { event: 'ai-client.parse.fallback', responseLength: text.length, firstLines: text.split('\n').slice(0, 3).join('\n') },
    'Pipe format parsing failed, attempting markdown fallback'
  );

  const fallback = parseMarkdownFallback(text);

  if (fallback.length === 0 && text.trim().length > 0) {
    aiLog.raw.warn(
      { event: 'ai-client.parse.empty', responseLength: text.length, firstLines: text.split('\n').slice(0, 5).join('\n') },
      'Both parsers returned 0 results from non-empty response'
    );
  }

  return fallback;
}

function parsePipeFormat(text: string): ParsedRecommendation[] {
  const recommendations: ParsedRecommendation[] = [];
  const lines = text.split('\n').filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Strip common prefixes: numbering, bullets, brackets, markdown bold
    const cleaned = line
      .replace(/^\s*\d+[.)]\s*/, '') // "1. " or "1) "
      .replace(/^\s*[-*]\s*/, '') // "- " or "* "
      .replace(/\*\*/g, '') // markdown bold
      .replace(/\[([^\]]*)\]/g, '$1') // [brackets] -> content
      .replace(/^Category:\s*/i, '') // "Category: "
      .trim();

    // Match format: CATEGORY | CONFIDENCE | Text
    const match = cleaned.match(
      /^(CONTENT|DESIGN|PRICING|CTA|TECHNICAL|SOCIAL_PROOF)\s*\|\s*(?:Confidence:\s*)?([0-9.]+)\s*\|\s*(.+)$/i
    );

    if (match) {
      const [, category, confidenceStr, recText] = match;
      const confidence = parseFloat(confidenceStr);

      if (confidence >= 0 && confidence <= 1) {
        recommendations.push({
          category: category.toUpperCase() as RecommendationCategory,
          text: recText.trim(),
          confidence,
        });
      }
    }
  }

  return recommendations;
}

function parseMarkdownFallback(text: string): ParsedRecommendation[] {
  const recommendations: ParsedRecommendation[] = [];
  const validCategories = [
    'CONTENT',
    'DESIGN',
    'PRICING',
    'CTA',
    'TECHNICAL',
    'SOCIAL_PROOF',
  ];
  const categoryPattern = validCategories.join('|');

  // Strategy 1: Look for category mentions with confidence in markdown
  const catConfRegex = new RegExp(
    `\\*{0,2}(${categoryPattern})\\*{0,2}\\s*(?:\\||[-\u2013\u2014:]|\\((?:Confidence:?\\s*)?)?\\s*([0-9]\\.[0-9]{1,2})\\s*(?:\\)|\\||[-\u2013\u2014:])?\\s*[|:\u2013\u2014-]?\\s*(.{20,})`,
    'gi'
  );

  for (const match of text.matchAll(catConfRegex)) {
    const [, category, confidenceStr, recText] = match;
    const confidence = parseFloat(confidenceStr);
    if (confidence >= 0 && confidence <= 1) {
      const cleanText = recText
        .replace(/\*\*/g, '')
        .replace(/^\s*[-*]\s*/, '')
        .replace(/\n.*/s, '') // Take only first line
        .trim();
      if (cleanText.length > 0) {
        recommendations.push({
          category: category.toUpperCase() as RecommendationCategory,
          text: cleanText,
          confidence,
        });
      }
    }
  }

  if (recommendations.length > 0) {
    return recommendations;
  }

  // Strategy 2: Look for category headers/labels followed by recommendation text
  const lines = text.split('\n');
  let currentCategory: RecommendationCategory | null = null;

  for (const line of lines) {
    const stripped = line
      .replace(/\*\*/g, '')
      .replace(/^#+\s*/, '')
      .trim();

    // Check if this line declares a category
    const catMatch = stripped.match(
      new RegExp(`^(${categoryPattern})(?:\\s|:|$)`, 'i')
    );
    if (catMatch) {
      currentCategory =
        catMatch[1].toUpperCase() as RecommendationCategory;
      // Check if recommendation text is on the same line after the category
      const afterCat = stripped
        .slice(catMatch[0].length)
        .replace(/^[\s:\u2013\u2014-]+/, '')
        .trim();
      if (afterCat.length >= 20) {
        recommendations.push({
          category: currentCategory,
          text: afterCat,
          confidence: 0.75, // default confidence for unscored markdown
        });
        currentCategory = null; // consumed
      }
      continue;
    }

    // If we have a pending category, grab the next substantive line as the recommendation
    if (currentCategory) {
      const cleanLine = line
        .replace(/^\s*[-*]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .replace(/\*\*/g, '')
        .trim();
      if (cleanLine.length >= 20) {
        recommendations.push({
          category: currentCategory,
          text: cleanLine,
          confidence: 0.75,
        });
        currentCategory = null;
      }
    }
  }

  if (recommendations.length > 0) {
    return recommendations;
  }

  // Strategy 3: Last resort -- find numbered/bulleted items mentioning categories
  const numberedRegex = new RegExp(
    `(?:^|\\n)\\s*(?:\\d+[.)]|[-*])\\s*\\*{0,2}[^\\n]*?(${categoryPattern})[^\\n]*?\\*{0,2}[:\\s]+([^\\n]{20,})`,
    'gi'
  );

  for (const match of text.matchAll(numberedRegex)) {
    const [, category, recText] = match;
    const cleanText = recText.replace(/\*\*/g, '').trim();
    if (cleanText.length > 0) {
      recommendations.push({
        category: category.toUpperCase() as RecommendationCategory,
        text: cleanText,
        confidence: 0.75,
      });
    }
  }

  return recommendations;
}
