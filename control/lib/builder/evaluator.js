/**
 * Smart Intent Evaluator
 *
 * LLM-based evaluation of user intent to determine assistance level.
 * Lightweight - only analyzes the user's message and whether documents are attached.
 * Does NOT read document contents - that's handled downstream.
 */

import Anthropic from '@anthropic-ai/sdk';

const EVALUATOR_MODEL = 'claude-sonnet-4-20250514';
const EVALUATOR_MAX_TOKENS = 1024;

/**
 * Evaluation prompt template
 */
const EVALUATOR_PROMPT = `You are an intent evaluator for a bot-building platform. Analyze the user's message to determine:

1. **Assistance Level**: Does this user need high assistance (guided flow) or low assistance (direct orchestration)?

**High Assistance** indicators:
- Vague or minimal instructions ("make a bot with this", "use this document")
- Questions about what to do ("what can you do with this?", "how should I set this up?")
- No specific bot configuration mentioned
- First-time user language
- Documents attached but no clear direction on how to use them

**Low Assistance** indicators:
- Specific bot requirements stated (name, purpose, fields to collect)
- Clear flow type mentioned (lead capture, appointment booking, support bot)
- Technical specificity (mentions webhooks, forms, specific integrations)
- Multiple configuration details provided
- Confident, directive language

2. **Extracted Context**: Pull out any actionable configuration from the user's message:
- Bot name or naming hints ("called X", "named X")
- Organization/company name ("for Acme Corp")
- Bot purpose or objective
- Flow type (support, lead gen, appointments, FAQ, etc.)
- Specific fields or data to collect
- Greeting or tone preferences

Respond in this exact format:

ASSISTANCE_LEVEL: [high|low]

CONTEXT:
[Free-form text with extracted configuration context. Be specific and actionable. This will be passed to the main bot configuration assistant to use as defaults.]

REASONING:
[Brief explanation of why you classified the assistance level this way]`;

/**
 * Evaluate user intent and extract context
 *
 * @param {string} userMessage - The user's input message
 * @param {boolean} hasDocuments - Whether documents are attached
 * @returns {Promise<{ assistanceLevel: 'high' | 'low', context: string, reasoning: string }>}
 */
export async function evaluateIntent(userMessage, hasDocuments = false) {
  const apiKey = process.env.BUILDER_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Evaluator] No API key, defaulting to high assistance');
    return {
      assistanceLevel: 'high',
      context: '',
      reasoning: 'API key not configured, defaulting to guided flow',
    };
  }

  // Build the evaluation input - just message + document presence metadata
  let evaluationInput = `USER MESSAGE:\n${userMessage}`;

  if (hasDocuments) {
    evaluationInput += `\n\n[Documents are attached to this message]`;
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      max_tokens: EVALUATOR_MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: evaluationInput,
        },
      ],
      system: EVALUATOR_PROMPT,
    });

    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return parseEvaluatorResponse(responseText);
  } catch (error) {
    console.error('[Evaluator] LLM call failed:', error.message);
    // Fallback to high assistance on error
    return {
      assistanceLevel: 'high',
      context: '',
      reasoning: `Evaluation failed (${error.message}), defaulting to guided flow`,
    };
  }
}

/**
 * Parse the evaluator's response into structured format
 *
 * @param {string} responseText - Raw response from evaluator LLM
 * @returns {{ assistanceLevel: 'high' | 'low', context: string, reasoning: string }}
 */
function parseEvaluatorResponse(responseText) {
  // Extract assistance level
  const levelMatch = responseText.match(/ASSISTANCE_LEVEL:\s*(high|low)/i);
  const assistanceLevel = levelMatch ? levelMatch[1].toLowerCase() : 'high';

  // Extract context section
  const contextMatch = responseText.match(/CONTEXT:\s*([\s\S]*?)(?=REASONING:|$)/i);
  const context = contextMatch ? contextMatch[1].trim() : responseText;

  // Extract reasoning section
  const reasoningMatch = responseText.match(/REASONING:\s*([\s\S]*?)$/i);
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';

  return {
    assistanceLevel,
    context,
    reasoning,
  };
}

/**
 * Quick heuristic check to determine if evaluation is needed
 * (Skip evaluation for obvious cases to save latency)
 *
 * @param {string} userMessage - The user's input message
 * @param {boolean} hasDocuments - Whether documents are attached
 * @returns {{ skipEvaluation: boolean, defaultLevel: 'high' | 'low' | null }}
 */
export function shouldSkipEvaluation(userMessage, hasDocuments) {
  const wordCount = userMessage.split(/\s+/).filter((w) => w.length > 0).length;

  // Very short message with documents = definitely high assistance
  if (hasDocuments && wordCount <= 10) {
    return { skipEvaluation: true, defaultLevel: 'high' };
  }

  // Very detailed message (100+ words) = definitely low assistance
  if (wordCount >= 100) {
    return { skipEvaluation: true, defaultLevel: 'low' };
  }

  // Otherwise, run the evaluator
  return { skipEvaluation: false, defaultLevel: null };
}
