/**
 * Builder Tool Executors for Inverted Flow
 *
 * Executes tool calls from Claude during the inverted builder flow.
 * These tools enable Claude to:
 * - Process documents into RAG summaries
 * - Infer user intent and confidence
 * - Recommend protocols based on context
 * - Generate configurations for each protocol
 * - Compose bot identity
 *
 * Philosophy: "Claude proposes, User disposes"
 */

import { validateToolInput } from './tools.js';
import { BuilderSessionRepository, SESSION_STATUS } from '@/lib/db/repositories/builderSessions.js';
import { DocumentRepository } from '@/lib/db/repositories/documents.js';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys.js';
import { decryptApiKey } from '@/lib/deployment-auth.js';
import { saveBuilderConfig } from './executor.js';
import { buildArtifact } from '@/lib/deployers/build.js';

/**
 * Get LLM configuration from session's preloaded context
 * Uses builder config settings with fallback to provider auto-selection
 * @param {Object} session - Builder session with preloadedContext
 * @param {string} userId - User ID for API key lookup
 * @returns {Promise<{ provider: string, apiKey: string, model: string | null }>}
 */
async function getLLMConfigFromSession(session, userId) {
  const { defaultProvider, defaultApiKeyId, defaultModel } = session.preloadedContext || {};

  // Get API keys for user
  const apiKeys = await ApiKeyRepository.findByUserId(userId);

  let apiKeyRecord;

  // First try: Use the specific API key ID from builder config
  if (defaultApiKeyId) {
    apiKeyRecord = apiKeys.find((k) => k.id === defaultApiKeyId);
  }

  // Second try: Find any key for the default provider
  if (!apiKeyRecord && defaultProvider) {
    apiKeyRecord = apiKeys.find((k) => k.provider === defaultProvider);
  }

  // Final fallback: anthropic > bedrock > others
  if (!apiKeyRecord) {
    const fallbackOrder = ['anthropic', 'bedrock', 'openai', 'gemini', 'cohere'];
    for (const provider of fallbackOrder) {
      apiKeyRecord = apiKeys.find((k) => k.provider === provider);
      if (apiKeyRecord) break;
    }
  }

  if (!apiKeyRecord) {
    throw new Error('No API key available for LLM operations');
  }

  return {
    provider: apiKeyRecord.provider,
    apiKey: decryptApiKey(apiKeyRecord.encryptedKey),
    model: defaultModel || null,
  };
}

/**
 * Static prompt suggestions per intent (fallback when domainDigest not available)
 */
const STATIC_PROMPT_SUGGESTIONS = {
  support_bot: [
    'How do I get started?',
    'What are the pricing options?',
    'I need help with my account',
  ],
  lead_gen: [
    'Tell me about your services',
    'I want to get a quote',
    'Schedule a demo',
  ],
  appointment_scheduler: [
    'What times are available?',
    'Book a consultation',
    'Reschedule my appointment',
  ],
  knowledge_base: [
    'How does this work?',
    'What are the features?',
    'Show me the documentation',
  ],
  feedback_collector: [
    'I have a suggestion',
    'Report an issue',
    'Share my experience',
  ],
  onboarding_assistant: [
    'Show me around',
    'What can I do here?',
    'Help me set up',
  ],
  triage_router: [
    'I need to talk to sales',
    'Technical support please',
    'Connect me to billing',
  ],
};

/**
 * Get static prompts for an intent type
 * @param {string} intent - Bot intent type
 * @returns {string[]} Array of suggested prompts
 */
function getStaticPromptsForIntent(intent) {
  return STATIC_PROMPT_SUGGESTIONS[intent] || STATIC_PROMPT_SUGGESTIONS.support_bot;
}

/**
 * Generate contextual firstMessage and objective from a domain digest using LLM
 * @param {string} domainDigest - Per-document LLM-composed digest of the corpus
 * @param {string} userMessage - Original user message describing what they want
 * @param {string} intent - Bot intent type
 * @param {string} organizationName - Organization name if available
 * @param {Object} session - Builder session for LLM config lookup
 * @param {string} userId - User ID for API key lookup
 * @returns {Promise<{ firstMessage: string, objective: string } | null>}
 */
async function generateContextualIdentity(domainDigest, userMessage, intent, organizationName, session, userId) {
  // Get LLM config from session (supports Anthropic, Bedrock, etc.)
  let llmConfig;
  try {
    llmConfig = await getLLMConfigFromSession(session, userId);
  } catch (err) {
    console.log('[Builder] No API key available for identity generation:', err.message);
    return null;
  }

  const { provider, apiKey, model } = llmConfig;
  const { generateSummary } = await import('@/lib/llm-providers.js');

  const intentLabel = intent.replace(/_/g, ' ');

  const identityPrompt = `Generate a contextual bot identity based on the following:

USER'S REQUEST:
${userMessage.substring(0, 500)}

DOCUMENT SUMMARY (knowledge the bot will have):
${domainDigest.substring(0, 1500)}

BOT TYPE: ${intentLabel}
ORGANIZATION: ${organizationName || 'Not specified'}

Generate:
1. **firstMessage**: A warm, specific greeting (1-2 sentences) that:
   - Introduces what the bot can help with based on the actual document content
   - Mentions specific topics/services from the documents (not generic)
   - Feels welcoming and helpful
   - Max 150 characters

2. **objective**: A concise statement (1 sentence) describing the bot's purpose that:
   - Is specific to the document content and user's request
   - Mentions key capabilities based on the documents
   - Max 200 characters

Return ONLY a JSON object with "firstMessage" and "objective" keys, no other text.
Example:
{"firstMessage": "Hi! I'm the Valley Dental assistant. I can help with appointment booking, insurance questions, or info about our services.", "objective": "Help visitors learn about dental services, pricing, insurance, and book appointments at Valley Dental."}`;

  try {
    const response = await generateSummary(
      provider,
      identityPrompt,
      apiKey,
      'Generate contextual bot identity',
      model
    );

    // Parse JSON object from response (handles markdown code blocks too)
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn('[Builder] No JSON object found in identity generation response');
      return null;
    }

    const identity = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!identity.firstMessage || !identity.objective) {
      console.warn('[Builder] Missing required fields in identity generation');
      return null;
    }

    // Clean and truncate
    const result = {
      firstMessage: identity.firstMessage.trim().substring(0, 200),
      objective: identity.objective.trim().substring(0, 250),
    };

    console.log('[Builder] Generated contextual identity:', result);
    return result;
  } catch (parseError) {
    console.warn('[Builder] Failed to parse identity generation response:', parseError.message);
    return null;
  }
}

/**
 * Execute a modular tool call
 * @param {string} toolName - Name of the tool
 * @param {Object} input - Tool input
 * @param {Object} context - Execution context (session, user, etc.)
 * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
 */
export async function executeBuilderTool(toolName, input, context) {
  const { session, userId } = context;

  // Validate input
  const validation = validateToolInput(toolName, input);
  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid input: ${validation.error}`,
    };
  }

  try {
    const handler = builderToolHandlers[toolName];
    if (!handler) {
      return {
        success: false,
        error: `Unknown modular tool: ${toolName}`,
      };
    }

    const result = await handler(input, context);
    return { success: true, result };
  } catch (error) {
    console.error(`[Builder] Tool execution error (${toolName}):`, error);
    return {
      success: false,
      error: error.message || 'Tool execution failed',
    };
  }
}

/**
 * Extract prepopulated settings from user message
 * Detects patterns like "called X", "named X", "bot name X", "resource X"
 * @param {string} userMessage - User's message
 * @returns {Object} Extracted settings (botName, resourceName, displayName, etc.)
 */
function extractPrepopulatedSettings(userMessage) {
  const settings = {};

  // Patterns for bot name detection
  // Matches: "called X", "named X", "bot name X", "name it X", "call it X"
  const botNamePatterns = [
    /(?:called|named|name it|call it)\s+["']?([a-zA-Z0-9][\w\s-]{0,30}[a-zA-Z0-9])["']?(?:\s|$|,|\.)/i,
    /bot\s+(?:name|called|named)\s+["']?([a-zA-Z0-9][\w\s-]{0,30}[a-zA-Z0-9])["']?(?:\s|$|,|\.)/i,
    /["']([a-zA-Z0-9][\w\s-]{0,30}[a-zA-Z0-9])["']\s+(?:bot|assistant)/i,
  ];

  // Patterns for resource/company name detection
  // Matches: "for X", "resource X", "company X", "organization X", "business X"
  const resourceNamePatterns = [
    /(?:for|resource|company|organization|business|brand)\s+(?:name\s+)?["']?([a-zA-Z0-9][\w\s&.-]{0,40}[a-zA-Z0-9])["']?(?:\s|$|,|\.)/i,
    /["']([a-zA-Z0-9][\w\s&.-]{0,40}[a-zA-Z0-9])["']\s+(?:company|organization|business|brand)/i,
  ];

  // Patterns for greeting/first message detection
  const greetingPatterns = [
    /(?:greeting|first message|welcome message|start with)\s*[:\s]+["'](.{5,150})["']/i,
    /greet(?:ing)?\s+(?:should be|as)\s+["'](.{5,150})["']/i,
  ];

  // Patterns for objective/purpose detection
  const objectivePatterns = [
    /(?:objective|purpose|goal)\s*[:\s]+["'](.{10,200})["']/i,
    /(?:should|will)\s+(?:help|assist)\s+(?:users?\s+)?(?:with\s+)?(.{10,150})/i,
  ];

  // Try to extract bot name
  for (const pattern of botNamePatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      // Sanitize for use as bot name (slug format)
      settings.botName = extracted
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 30);
      // Also store the display-friendly version
      settings.displayName = extracted;
      break;
    }
  }

  // Try to extract resource/organization name
  for (const pattern of resourceNamePatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      // Avoid matching common words that aren't company names
      const skipWords = ['my', 'the', 'a', 'an', 'this', 'that', 'our', 'their', 'your'];
      if (!skipWords.includes(extracted.toLowerCase())) {
        settings.resourceName = extracted;
        break;
      }
    }
  }

  // Try to extract custom greeting
  for (const pattern of greetingPatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      settings.firstMessage = match[1].trim();
      break;
    }
  }

  // Try to extract objective
  for (const pattern of objectivePatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      settings.objective = match[1].trim();
      break;
    }
  }

  return settings;
}

/**
 * Embed a batch of {text, metadata} chunks locally and persist into the
 * session's embeddings blob. If the blob already exists (e.g. knowledge docs
 * were embedded earlier in the same session), append; otherwise create.
 *
 * The single-blob shape lets one cosine search return the most relevant chunk
 * regardless of whether it came from a document or a triage route — the LLM
 * uses metadata.source at the formatting layer to decide what to do with it.
 */
async function embedAndPersistChunks(chunks, session) {
  const { downloadToBuffer, uploadFile, deleteFile } = await import('@/lib/storage/index.js');
  const { generateEmbeddings, LOCAL_EMBEDDING_MODEL } = await import('@/lib/embedder/local.js');

  if (!chunks || chunks.length === 0) {
    throw new Error('embedAndPersistChunks: chunks must be a non-empty array');
  }

  const storageKey = `embeddings/${session.id}.json`;

  let existingChunks = [];
  try {
    const existing = await downloadToBuffer(storageKey);
    if (existing) {
      const parsed = JSON.parse(existing.toString('utf8'));
      if (Array.isArray(parsed.chunks)) existingChunks = parsed.chunks;
    }
  } catch {
    // First write or unreadable prior blob — start fresh.
  }

  let embeddings;
  try {
    embeddings = await generateEmbeddings(
      chunks.map((c) => c.text),
      { inputType: 'search_document' }
    );
  } catch (err) {
    if (existingChunks.length === 0) {
      await deleteFile(storageKey).catch(() => {});
    }
    throw new Error(`Local embedding failed: ${err.message}`);
  }

  if (embeddings.length !== chunks.length) {
    if (existingChunks.length === 0) {
      await deleteFile(storageKey).catch(() => {});
    }
    throw new Error(
      `Embedder returned ${embeddings.length} vectors for ${chunks.length} chunks`
    );
  }

  const newChunks = chunks.map((c, i) => ({
    text: c.text,
    embedding: embeddings[i],
    metadata: c.metadata,
  }));

  const merged = [...existingChunks, ...newChunks];
  const payload = {
    model: LOCAL_EMBEDDING_MODEL,
    chunkCount: merged.length,
    createdAt: new Date().toISOString(),
    chunks: merged,
  };

  await uploadFile(storageKey, Buffer.from(JSON.stringify(payload), 'utf8'));

  return { storageKey, chunkCount: merged.length, model: LOCAL_EMBEDDING_MODEL };
}

/**
 * Vector branch of process_documents: parse → chunk → embed locally via
 * @huggingface/transformers (multilingual-e5-small) → persist a single JSON
 * blob to the factory's filesystem storage. The resulting storageKey is
 * stashed on the session so save_modular_bot can copy it onto the
 * deployment row and the build pipeline can stream it into the artifact's
 * config/embeddings.json.
 *
 * Embed failures: wipe the partial blob, surface the error. No silent
 * partial state.
 */
async function processDocumentsVector(documents, documentIds, session, userId) {
  const { downloadToBuffer } = await import('@/lib/storage/index.js');
  const { parseDocument } = await import('@/lib/document-parser.js');
  const { chunkDocuments } = await import('@/lib/embedder/chunker.js');
  const { LOCAL_EMBEDDING_MODEL } = await import('@/lib/embedder/local.js');

  // Parse all documents.
  const parsed = [];
  for (const doc of documents) {
    try {
      const buffer = await downloadToBuffer(doc.storagePath);
      const text = await parseDocument(buffer, doc.originalName);
      if (text && text.trim().length > 0) {
        parsed.push({ id: doc.id, originalName: doc.originalName, text });
      }
    } catch (err) {
      console.error(`[Builder] Failed to parse ${doc.originalName}:`, err.message);
    }
  }
  if (parsed.length === 0) {
    throw new Error('Vector embedding: no documents parseable');
  }

  // Chunk.
  const chunks = chunkDocuments(parsed);
  if (chunks.length === 0) {
    throw new Error('Vector embedding: no chunks produced from documents');
  }

  console.log(
    `[Builder] Vector embedding ${chunks.length} chunks across ${parsed.length} docs locally (${LOCAL_EMBEDDING_MODEL})`
  );

  const { storageKey, chunkCount } = await embedAndPersistChunks(chunks, session);

  // Compose a domain digest for build-time tools (compose_identity,
  // infer_appointment_types, generate_suggested_prompts). Per-document LLM
  // summary, then concatenate. Not consumed at runtime — the bundled
  // embedding model handles retrieval — only used by the builder pipeline.
  // Falls back to a chunk-slice surrogate if every summary call fails so
  // the build can still progress.
  const { generateSummary } = await import('@/lib/llm-providers.js');
  const llmConfig = await getLLMConfigFromSession(session, userId);
  const { provider, apiKey, model } = llmConfig;

  const summaryPrompt = `Analyze this document and provide a comprehensive summary that:

1. Identifies key terms, concepts, and topics covered
2. Highlights the main themes and subject areas
3. Lists important entities, processes, or procedures mentioned
4. Notes any technical specifications, data, or metrics

IMPORTANT: Generate the summary in the SAME LANGUAGE as the original document.

Synthesize the information into max 3 paragraphs, 200 words.

Keep the summary high-level, factual, and cohesive.`;

  const individualSummaries = [];
  for (const doc of parsed) {
    try {
      const docSummary = await generateSummary(provider, doc.text, apiKey, summaryPrompt, model);
      individualSummaries.push({ name: doc.originalName, summary: docSummary });
    } catch (err) {
      console.error(`[Builder] Failed to summarize ${doc.originalName}:`, err.message);
      individualSummaries.push({ name: doc.originalName, summary: `[Error: ${err.message}]` });
    }
  }

  const combinedSummary = individualSummaries
    .filter((s) => !s.summary.startsWith('[Error'))
    .map((s) => `## ${s.name}\n\n${s.summary}`)
    .join('\n\n---\n\n');

  const domainDigest =
    combinedSummary ||
    chunks
      .slice(0, 12)
      .map((c) => c.text)
      .join('\n')
      .slice(0, 4000);

  await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'knowledge', {
    domainDigest,
    documentIds,
    documentsProcessed: parsed.length,
    totalDocuments: documents.length,
    ragMode: 'vector',
  });

  await BuilderSessionRepository.updateGeneratedConfig(
    session.id,
    userId,
    'embeddings',
    {
      storageKey,
      model: LOCAL_EMBEDDING_MODEL,
      chunkCount,
    }
  );

  return {
    ragMode: 'vector',
    documentsProcessed: parsed.length,
    totalDocuments: documents.length,
    chunkCount,
    embeddingModel: LOCAL_EMBEDDING_MODEL,
    storageKey,
    message: `Embedded ${chunks.length} chunks from ${parsed.length} documents using ${LOCAL_EMBEDDING_MODEL} (total ${chunkCount} chunks in store).`,
  };
}

/**
 * Tool handlers for inverted modular flow
 */
const builderToolHandlers = {
  /**
   * Parse uploaded documents, embed them locally via the bundled
   * multilingual-e5-small ONNX model, and stash the embedding blob on the
   * session so save_modular_bot can copy it onto the deployment row. Also
   * generates a build-time `domainDigest` on the session that's consumed by
   * compose_identity and other downstream tools.
   */
  async process_documents(input, context) {
    const { documentIds } = input;
    const { session, userId } = context;

    if (!documentIds || documentIds.length === 0) {
      throw new Error('No document IDs provided');
    }

    const documents = await DocumentRepository.findByIds(documentIds);
    if (documents.length === 0) {
      throw new Error('No documents found with the provided IDs');
    }

    console.log(`[Builder] Processing ${documents.length} documents (vector mode)`);
    return processDocumentsVector(documents, documentIds, session, userId);
  },

  /**
   * Infer user intent from message and context
   */
  async infer_intent(input, context) {
    const { userMessage, domainDigest } = input;
    const { session, userId } = context;

    // Intent classification based on keywords and context
    // Note: 'faq' maps to knowledge_base (Q&A from documents), not support_bot
    const intentPatterns = [
      { intent: 'knowledge_base', keywords: ['faq', 'knowledge', 'documentation', 'docs', 'wiki', 'information', 'answer questions', 'q&a'], confidence: 0.9 },
      { intent: 'support_bot', keywords: ['support', 'help desk', 'customer service', 'ticket', 'assist', 'troubleshoot'], confidence: 0.88 },
      { intent: 'lead_gen', keywords: ['lead', 'capture', 'collect', 'form', 'contact', 'inquiry', 'sales'], confidence: 0.88 },
      { intent: 'appointment_scheduler', keywords: ['appointment', 'booking', 'schedule', 'calendar', 'book', 'meeting'], confidence: 0.92 },
      { intent: 'feedback_collector', keywords: ['feedback', 'survey', 'review', 'rating', 'opinion'], confidence: 0.87 },
      { intent: 'onboarding_assistant', keywords: ['onboard', 'welcome', 'getting started', 'new user', 'tutorial'], confidence: 0.86 },
      { intent: 'triage_router', keywords: ['triage', 'route', 'routing', 'redirect', 'transfer', 'dispatch', 'multi-bot', 'orchestrat'], confidence: 0.91 },
    ];

    const messageLower = userMessage.toLowerCase();
    const summaryLower = (domainDigest || '').toLowerCase();
    const combined = `${messageLower} ${summaryLower}`;

    let bestMatch = { intent: 'support_bot', confidence: 0.7, reason: 'Default intent for general assistance' };

    for (const pattern of intentPatterns) {
      const matchCount = pattern.keywords.filter(kw => combined.includes(kw)).length;
      if (matchCount > 0) {
        const adjustedConfidence = Math.min(pattern.confidence + (matchCount * 0.02), 0.98);
        if (adjustedConfidence > bestMatch.confidence) {
          bestMatch = {
            intent: pattern.intent,
            confidence: adjustedConfidence,
            reason: `Detected keywords: ${pattern.keywords.filter(kw => combined.includes(kw)).join(', ')}`,
          };
        }
      }
    }

    // Extract prepopulated settings from user message
    const prepopulatedSettings = extractPrepopulatedSettings(userMessage);

    // Update session with inference and prepopulated settings
    await BuilderSessionRepository.updateInference(session.id, userId, {
      intent: bestMatch.intent,
      confidence: bestMatch.confidence,
      recommendedProtocols: {}, // Will be filled by recommend_protocols
    });

    // Store prepopulated settings in generatedConfigs for use by compose_identity
    if (Object.keys(prepopulatedSettings).length > 0) {
      await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'prepopulated', prepopulatedSettings);
    }

    return {
      intent: bestMatch.intent,
      confidence: bestMatch.confidence,
      reason: bestMatch.reason,
      prepopulatedSettings: Object.keys(prepopulatedSettings).length > 0 ? prepopulatedSettings : undefined,
    };
  },

  /**
   * Recommend protocols based on inferred intent
   */
  async recommend_protocols(input, context) {
    const { intent, domainDigest, userMessage } = input;
    const { session, userId } = context;

    const recommendations = {
      knowledge: {
        enabled: false,
        reason: 'No document context detected',
        presetConfig: null,
      },
      forms: {
        enabled: false,
        reason: 'No data collection intent detected',
        presetConfig: null,
      },
      appointments: {
        enabled: false,
        reason: 'No booking/scheduling intent detected',
        presetConfig: null,
      },
      triage: {
        enabled: false,
        reason: 'No routing intent detected',
        presetConfig: null,
      },
    };

    // Knowledge protocol
    if (domainDigest || session.generatedConfigs?.knowledge?.domainDigest) {
      recommendations.knowledge.enabled = true;
      recommendations.knowledge.reason = 'Documents uploaded - knowledge base enabled';
      recommendations.knowledge.presetConfig = {
        domainDigest: domainDigest || session.generatedConfigs?.knowledge?.domainDigest,
        documentIds: session.generatedConfigs?.knowledge?.documentIds || [],
      };
    }

    // Forms protocol - only enable when user explicitly requests data collection
    // Check for explicit collection keywords in the user's message
    const messageLower = (userMessage || '').toLowerCase();
    const explicitFormKeywords = [
      'collect', 'capture', 'gather', 'form', 'submit', 'input',
      'contact info', 'email address', 'phone number', 'sign up',
      'registration', 'lead', 'inquiry', 'feedback', 'survey'
    ];
    const hasExplicitFormRequest = explicitFormKeywords.some(kw => messageLower.includes(kw));

    if (hasExplicitFormRequest) {
      recommendations.forms.enabled = true;
      recommendations.forms.reason = 'User requested data collection';
    } else if (intent === 'lead_gen' || intent === 'feedback_collector') {
      // These intents inherently require forms
      recommendations.forms.enabled = true;
      recommendations.forms.reason = `${intent} requires data collection`;
    }

    // Appointments protocol
    if (intent === 'appointment_scheduler') {
      recommendations.appointments.enabled = true;
      recommendations.appointments.reason = 'Scheduling intent detected';
      // Disable forms for pure appointment bots
      recommendations.forms.enabled = false;
      recommendations.forms.reason = 'Not needed for appointment-only flow';
    }

    // Triage protocol - detect routing/orchestration intent
    const triageKeywords = [
      'triage', 'route', 'routing', 'redirect', 'transfer',
      'multi-bot', 'orchestrat', 'dispatch', 'forward',
      'different team', 'right department', 'connect to'
    ];
    const hasTriageRequest = triageKeywords.some(kw => messageLower.includes(kw));

    // Also check if triage routes are already configured in the session
    const hasExistingTriageRoutes = session.generatedConfigs?.triage?.routes?.length > 0;

    if (hasTriageRequest || hasExistingTriageRoutes) {
      recommendations.triage.enabled = true;
      recommendations.triage.reason = hasExistingTriageRoutes
        ? 'Triage routes configured'
        : 'Routing intent detected';
      if (hasExistingTriageRoutes) {
        recommendations.triage.presetConfig = {
          routes: session.generatedConfigs.triage.routes,
        };
      }
    }

    // Update session with recommendations
    await BuilderSessionRepository.updateInference(session.id, userId, {
      intent,
      confidence: session.intentConfidence || 0.85,
      recommendedProtocols: recommendations,
    });

    return {
      protocols: recommendations,
      summary: Object.entries(recommendations)
        .filter(([_, v]) => v.enabled)
        .map(([k, _]) => k)
        .join(', ') || 'None recommended',
    };
  },

  /**
   * Generate form schema based on context
   */
  async generate_form_schema(input, context) {
    const { description, formType = 'custom', locale = 'en', afterSubmitChatMessage } = input;
    const { session, userId } = context;

    // Get LLM config from session (supports Anthropic, Bedrock, etc.)
    const llmConfig = await getLLMConfigFromSession(session, userId);
    const { provider, apiKey, model } = llmConfig;

    const { generateSummary } = await import('@/lib/llm-providers.js');
    const { buildFormSchemaPrompt, isLocaleSupported, DEFAULT_LOCALE } = await import('@/lib/form-schema-config/index.js');

    const resolvedLocale = isLocaleSupported(locale) ? locale : DEFAULT_LOCALE;

    const basePrompt = `You are a form structure generator. Convert the description into a JSON form schema.

OUTPUT FORMAT: Return ONLY valid JSON matching this structure:
{
  "sections": [
    {
      "id": "section-id",
      "label": "Section Label",
      "fields": [
        {
          "id": "fieldId",
          "label": "Field Label",
          "type": "text|email|tel|number|select|date|textarea|checkbox|radio",
          "required": true|false,
          "placeholder": "optional placeholder",
          "options": ["for select/radio types"]
        }
      ]
    }
  ],
  "afterSubmitMessage": "A contextual thank you message shown after form submission"
}

Keep forms concise - 4-8 fields maximum. Group related fields into sections.
The afterSubmitMessage should be friendly, contextual to the form purpose, and in the appropriate language for the locale.`;

    const localePrompt = buildFormSchemaPrompt(resolvedLocale);
    const fullPrompt = `${basePrompt}\n\n${localePrompt}`;

    const response = await generateSummary(provider, description, apiKey, fullPrompt, model);

    // Parse JSON response
    let formSchema;
    try {
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;
      formSchema = JSON.parse(jsonString.trim());
    } catch (parseError) {
      console.error('[Builder] Failed to parse form schema:', parseError);
      throw new Error('Failed to generate form structure');
    }

    // Validate structure
    if (!Array.isArray(formSchema.sections) || formSchema.sections.length === 0) {
      throw new Error('Generated form structure is invalid');
    }

    const fieldCount = formSchema.sections.reduce((acc, s) => acc + (s.fields?.length || 0), 0);

    // Use provided afterSubmitChatMessage, or generated one from schema, or default
    const resolvedAfterSubmitMessage = afterSubmitChatMessage
      || formSchema.afterSubmitMessage
      || 'Thank you for your submission! How can I help you further?';

    // Remove afterSubmitMessage from schema (it's stored separately)
    delete formSchema.afterSubmitMessage;

    // Store in session - formSendHome defaults to true (send submissions to control plane)
    // Save the original description as formStructureInput so it persists for edit mode
    await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'forms', {
      formSchema,
      formStructureInput: description,
      fieldCount,
      sectionCount: formSchema.sections.length,
      formSendHome: true,
      afterSubmitChatMessage: resolvedAfterSubmitMessage,
    });

    return {
      formSchema,
      fieldCount,
      sectionCount: formSchema.sections.length,
      formSendHome: true,
      afterSubmitChatMessage: resolvedAfterSubmitMessage,
      message: `Created form with ${fieldCount} fields`,
    };
  },

  /**
   * Generate appointment configuration
   */
  async generate_appointment_config(input, context) {
    let { domainDigest, businessType, calendarProviders = [] } = input;
    const { session, userId } = context;
    // Same pattern as compose_identity / recommend_protocols: schema field is
    // documentation, session is the source of truth.
    domainDigest = domainDigest || session.generatedConfigs?.knowledge?.domainDigest;

    // Generate basic appointment config structure
    const config = {
      destinations: [],
      defaultDuration: 30,
      bufferTime: 15,
      maxAdvanceBooking: 30, // days
    };

    // If domainDigest contains service info, try to extract appointment types
    if (domainDigest) {
      // Basic extraction - could be enhanced with LLM
      const serviceKeywords = ['consultation', 'meeting', 'session', 'appointment', 'call'];
      for (const keyword of serviceKeywords) {
        if (domainDigest.toLowerCase().includes(keyword)) {
          config.destinations.push({
            id: `${keyword}-${Date.now()}`,
            provider: calendarProviders[0] || 'cal.com',
            description: `${businessType || 'General'} ${keyword}`,
            duration: 30,
          });
          break; // Just add one default for now
        }
      }
    }

    // Store in session
    await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'appointments', config);

    return {
      config,
      message: config.destinations.length > 0
        ? `Generated ${config.destinations.length} appointment type(s)`
        : 'Appointment configuration ready - destinations need to be configured',
    };
  },

  /**
   * Generate triage routing configuration
   */
  async generate_triage_config(input, context) {
    const { routes } = input;
    const { session, userId } = context;

    if (!routes || routes.length === 0) {
      throw new Error('No triage routes provided');
    }

    // Slugify helper for generating deployment IDs from names
    const slugify = (name) =>
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    // Process and validate routes
    const processedRoutes = routes.map((route) => {
      if (!route.name || !route.description || !route.url) {
        throw new Error(`Invalid route: name, description, and url are required. Got: ${JSON.stringify(route)}`);
      }

      return {
        deploymentId: route.deploymentId || slugify(route.name),
        name: route.name.trim(),
        description: route.description.trim(),
        url: route.url.trim(),
      };
    });

    // Check for duplicate deploymentIds
    const deploymentIds = processedRoutes.map((r) => r.deploymentId);
    const duplicates = deploymentIds.filter((id, index) => deploymentIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate deployment IDs detected: ${[...new Set(duplicates)].join(', ')}`);
    }

    console.log(`[Builder] Generated triage config with ${processedRoutes.length} routes`);

    // Store in session's generated configs
    await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'triage', {
      routes: processedRoutes,
      routeCount: processedRoutes.length,
    });

    // Embed each route's description into the same cosine index that knowledge
    // chunks use. The retrieval signal here is intent-match: when a user
    // describes what they want, the LLM gets the matching route description
    // pulled into context, reinforcing the JSON-list lookup it would do
    // anyway. The deploymentId itself is authoritative on the JSON list — the
    // embedding is contextual reinforcement, not the source of routing IDs.
    const { chunkTriageRoutes } = await import('@/lib/embedder/chunker.js');
    const { LOCAL_EMBEDDING_MODEL } = await import('@/lib/embedder/local.js');
    const routeChunks = chunkTriageRoutes(processedRoutes);
    if (routeChunks.length > 0) {
      const { storageKey, chunkCount } = await embedAndPersistChunks(routeChunks, session);
      await BuilderSessionRepository.updateGeneratedConfig(
        session.id,
        userId,
        'embeddings',
        {
          storageKey,
          model: LOCAL_EMBEDDING_MODEL,
          chunkCount,
        }
      );
    }

    return {
      routes: processedRoutes,
      routeCount: processedRoutes.length,
      message: `Configured ${processedRoutes.length} triage route(s): ${processedRoutes.map((r) => r.name).join(', ')}`,
    };
  },

  /**
   * Compose bot identity from context
   */
  async compose_identity(input, context) {
    const { intent, domainDigest, organizationName, enabledProtocols, userMessage } = input;
    const { session, userId } = context;

    // Check for prepopulated settings from infer_intent
    const prepopulated = session.generatedConfigs?.prepopulated || {};

    // Use prepopulated resource name if available, otherwise use organizationName
    const effectiveOrgName = prepopulated.resourceName || organizationName;

    // Generate bot name - use prepopulated if available
    let botName;
    if (prepopulated.botName) {
      // Use the prepopulated bot name directly (already sanitized)
      botName = prepopulated.botName;
    } else {
      // Generate bot name from organization and intent
      const sanitizedOrg = (effectiveOrgName || 'my')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 20);

      const intentSuffix = {
        support_bot: 'support',
        lead_gen: 'leads',
        appointment_scheduler: 'booking',
        knowledge_base: 'help',
        feedback_collector: 'feedback',
        onboarding_assistant: 'onboard',
        triage_router: 'triage',
      }[intent] || 'bot';

      botName = `${sanitizedOrg}-${intentSuffix}`;
    }

    // Generate objective based on intent - use prepopulated if available
    const objectives = {
      support_bot: `Help users with questions and support requests${effectiveOrgName ? ` for ${effectiveOrgName}` : ''}`,
      lead_gen: `Collect contact information and qualify leads${effectiveOrgName ? ` for ${effectiveOrgName}` : ''}`,
      appointment_scheduler: `Help users book appointments${effectiveOrgName ? ` with ${effectiveOrgName}` : ''}`,
      knowledge_base: `Answer questions using the knowledge base${effectiveOrgName ? ` for ${effectiveOrgName}` : ''}`,
      feedback_collector: `Collect user feedback and suggestions${effectiveOrgName ? ` for ${effectiveOrgName}` : ''}`,
      onboarding_assistant: `Guide new users through getting started${effectiveOrgName ? ` with ${effectiveOrgName}` : ''}`,
      triage_router: `Route users to the right team or specialist${effectiveOrgName ? ` at ${effectiveOrgName}` : ''}`,
    };

    // Generate first message - use prepopulated if available
    const firstMessages = {
      support_bot: `Hi! I'm here to help with any questions you might have${effectiveOrgName ? ` about ${effectiveOrgName}` : ''}. How can I assist you today?`,
      lead_gen: `Hello! I'd love to learn more about what you're looking for. How can I help you get started?`,
      appointment_scheduler: `Hi! I can help you schedule an appointment. What type of appointment are you looking to book?`,
      knowledge_base: `Hello! I have access to our knowledge base and can answer your questions. What would you like to know?`,
      feedback_collector: `Hi there! I'd love to hear your thoughts and feedback. What's on your mind?`,
      onboarding_assistant: `Welcome! I'm here to help you get started. Would you like a quick tour of the features?`,
      triage_router: `Hi! I can help connect you with the right team. What can I help you with today?`,
    };

    // Generate contextual identity (firstMessage + objective) if domainDigest available
    // Note: suggestedPrompts are now set separately via set_suggested_prompts tool
    // to ensure proper localization in the same language as documents
    let contextualFirstMessage = null;
    let contextualObjective = null;

    // For triage routers, build an effective digest from route descriptions (botSummaries).
    // Fall back to the session-stored digest (written by process_documents) when
    // the LLM doesn't pass it — the schema field is documentation, the session
    // is the source of truth.
    let effectiveDigest = domainDigest || session.generatedConfigs?.knowledge?.domainDigest;
    if (intent === 'triage_router' && (!domainDigest || domainDigest.trim().length === 0)) {
      const triageRoutes = session.generatedConfigs?.triage?.routes;
      if (triageRoutes && triageRoutes.length > 0) {
        // Build digest from route descriptions (which are target bots' botSummary)
        effectiveDigest = triageRoutes
          .map((route) => `${route.name}: ${route.description}`)
          .join('\n');
        console.log('[Builder] Using triage routes as effective domain digest for identity');
      }
    }

    if (effectiveDigest && effectiveDigest.trim().length > 0) {
      // Try to generate contextual identity (firstMessage + objective) using LLM
      const effectiveUserMessage = userMessage || session.userMessage || '';
      try {
        const contextualIdentity = await generateContextualIdentity(
          effectiveDigest,
          effectiveUserMessage,
          intent,
          effectiveOrgName,
          session,
          userId
        );
        if (contextualIdentity) {
          contextualFirstMessage = contextualIdentity.firstMessage;
          contextualObjective = contextualIdentity.objective;
          console.log('[Builder] Using contextual identity from LLM');
        }
      } catch (err) {
        console.warn('[Builder] Failed to generate contextual identity:', err.message);
      }
    }

    // Use static prompts as placeholder - Claude will set localized prompts via set_suggested_prompts
    const suggestedPrompts = getStaticPromptsForIntent(intent);

    // Build identity with priority: prepopulated > contextual LLM > static templates
    const identity = {
      botName,
      displayName: prepopulated.displayName || (effectiveOrgName ? `${effectiveOrgName} Assistant` : 'Assistant'),
      objective: prepopulated.objective || contextualObjective || objectives[intent] || objectives.support_bot,
      firstMessage: prepopulated.firstMessage || contextualFirstMessage || firstMessages[intent] || firstMessages.support_bot,
      suggestedPrompts,
    };

    // Store in session
    await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'identity', identity);

    // Also update core config with defaults from preloaded context
    const coreConfig = {
      provider: session.preloadedContext?.defaultProvider || 'anthropic',
      model: session.preloadedContext?.defaultModel || 'claude-sonnet-4-20250514',
      apiKeyId: session.preloadedContext?.defaultApiKeyId,
      botName: identity.botName,
    };

    await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'core', coreConfig);

    // Build message indicating what was used
    const usedPrepopulated = [];
    if (prepopulated.botName) usedPrepopulated.push('bot name');
    if (prepopulated.displayName) usedPrepopulated.push('display name');
    if (prepopulated.resourceName) usedPrepopulated.push('organization');
    if (prepopulated.objective) usedPrepopulated.push('objective');
    if (prepopulated.firstMessage) usedPrepopulated.push('greeting');

    const prepopulatedNote = usedPrepopulated.length > 0
      ? ` (using user-specified: ${usedPrepopulated.join(', ')})`
      : '';

    return {
      identity,
      prepopulatedSettings: Object.keys(prepopulated).length > 0 ? prepopulated : undefined,
      message: `Composed identity: ${identity.botName}${prepopulatedNote}`,
    };
  },

  /**
   * Set suggested prompts for the bot (allows Claude to provide localized prompts)
   */
  async set_suggested_prompts(input, context) {
    const { prompts } = input;
    const { session, userId } = context;

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('At least one prompt is required');
    }

    // Clean and validate prompts
    const cleanedPrompts = prompts
      .filter((p) => typeof p === 'string' && p.trim().length > 0)
      .map((p) => p.trim())
      .slice(0, 5);

    if (cleanedPrompts.length === 0) {
      throw new Error('No valid prompts provided');
    }

    // Get current identity from session
    const currentIdentity = session.generatedConfigs?.identity || {};

    // Update identity with new prompts
    const updatedIdentity = {
      ...currentIdentity,
      suggestedPrompts: cleanedPrompts,
    };

    // Store in session
    await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'identity', updatedIdentity);

    console.log('[Builder] Set suggested prompts:', cleanedPrompts);

    return {
      identity: updatedIdentity,
      promptCount: cleanedPrompts.length,
      message: `Set ${cleanedPrompts.length} suggested prompts`,
    };
  },

  /**
   * Generate a structured prose summary of the bot for multi-bot orchestration
   */
  async generate_bot_summary(input, context) {
    const { session, userId } = context;

    // Get LLM config from session (supports Anthropic, Bedrock, etc.)
    const llmConfig = await getLLMConfigFromSession(session, userId);
    const { provider, apiKey, model } = llmConfig;

    const { generateSummary } = await import('@/lib/llm-providers.js');

    // Gather context from session
    const { enabledProtocols, identityConfig, protocolData, generatedConfigs } = session;
    const identity = generatedConfigs?.identity || identityConfig || {};

    // Build compact context for the LLM
    const contextParts = [];

    // Bot identity
    contextParts.push(`Bot Name: ${identity.botName || 'Unnamed Bot'}`);
    contextParts.push(`Purpose: ${identity.objective || 'General assistant'}`);

    // Knowledge context
    if (enabledProtocols.knowledge) {
      const domainDigest = protocolData?.knowledge?.domainDigest || generatedConfigs?.knowledge?.domainDigest;
      if (domainDigest) {
        // Extract first 500 chars of the digest for context
        contextParts.push(`Knowledge Base Topics: ${domainDigest.substring(0, 500)}`);
      }
      const docCount = protocolData?.knowledge?.documents?.length || generatedConfigs?.knowledge?.documentsProcessed || 0;
      if (docCount > 0) {
        contextParts.push(`Documents: ${docCount} document(s) processed`);
      }
    }

    // Form collection context
    if (enabledProtocols.formGathering) {
      const formSchema = protocolData?.formGathering?.generatedFormJson || generatedConfigs?.forms?.formSchema;
      if (formSchema?.sections) {
        const fieldNames = formSchema.sections
          .flatMap(s => s.fields || [])
          .map(f => f.label)
          .slice(0, 8);
        contextParts.push(`Collects Information: ${fieldNames.join(', ')}`);
      }
    }

    // Appointments context
    if (enabledProtocols.appointments) {
      const destinations = protocolData?.appointments?.destinations || generatedConfigs?.appointments?.destinations || [];
      if (destinations.length > 0) {
        const destNames = destinations.map(d => d.name || d.description).slice(0, 5);
        contextParts.push(`Appointment Types: ${destNames.join(', ')}`);
      }
    }

    // Triage context
    if (enabledProtocols.triage) {
      const routes = protocolData?.triage?.routes || [];
      if (routes.length > 0) {
        const routeNames = routes.map(r => r.botName || r.name).slice(0, 5);
        contextParts.push(`Routes To: ${routeNames.join(', ')}`);
      }
    }

    const contextString = contextParts.join('\n');

    // System prompt for structured prose generation
    const systemPrompt = `You are generating a bot summary for a multi-bot orchestration system. Other bots will read this summary to understand what this bot does and when to route conversations to it.

Write a clear, concise description in 2-3 sentences that covers:
1. What the bot is and its primary purpose
2. What knowledge or information it has access to (if any)
3. What actions it can perform (collect info, book appointments, route to specialists)

Style guidelines:
- Use third person ("This bot..." or "The [Name] assistant...")
- Be specific about capabilities, not generic
- Keep it under 150 words
- No bullet points - flowing prose only
- No markdown formatting

Return ONLY the summary text, nothing else.`;

    const userPrompt = `Generate a bot summary based on this configuration:\n\n${contextString}`;

    try {
      const botSummary = await generateSummary(
        provider,
        userPrompt,
        apiKey,
        systemPrompt,
        model
      );

      const cleanedSummary = botSummary.trim();

      // Store botSummary at top level of generatedConfigs (beside objective, paradigm)
      await BuilderSessionRepository.updateGeneratedConfig(session.id, userId, 'botSummary', cleanedSummary);

      console.log('[Builder] Generated bot summary:', cleanedSummary.substring(0, 100) + '...');

      return {
        botSummary: cleanedSummary,
        message: 'Bot summary generated successfully',
      };
    } catch (error) {
      console.error('[Builder] Failed to generate bot summary:', error.message);
      throw new Error(`Failed to generate bot summary: ${error.message}`);
    }
  },

  /**
   * Save the bot's composed configuration to a deployment row, then build
   * the artifact so the user lands on the dashboard with a ready ZIP.
   *
   * Build failures don't fail the tool — the row stays `saved` and the
   * dashboard's Build button picks up where this left off.
   */
  async save_modular_bot(input, context) {
    const { sessionId, confirmedProtocols } = input;
    const { session, userId } = context;

    if (session.id !== sessionId) {
      throw new Error('Session ID mismatch');
    }

    const editingDeployment = session.generatedConfigs?._editingDeployment;
    const isUpdate = !!editingDeployment?.id;

    await BuilderSessionRepository.updateStatus(sessionId, userId, SESSION_STATUS.DEPLOYING);
    await BuilderSessionRepository.confirmProtocols(sessionId, userId, confirmedProtocols);
    await BuilderSessionRepository.syncGeneratedConfigsToLegacy(sessionId, userId);

    const updatedSession = await BuilderSessionRepository.findById(sessionId);

    const result = await saveBuilderConfig(sessionId, userId, {
      botSpaceId: updatedSession.botSpaceId,
      redeploymentId: isUpdate ? editingDeployment.id : null,
    });

    if (result.success) {
      await BuilderSessionRepository.updateStatus(sessionId, userId, SESSION_STATUS.DEPLOYED);
      await BuilderSessionRepository.linkDeployment(sessionId, userId, result.deploymentId);

      let buildStatus = result.status;
      let buildError = null;
      try {
        const { deployment } = await buildArtifact(result.deploymentId);
        buildStatus = deployment.status;
      } catch (err) {
        console.error('[save_modular_bot] build after save failed:', err);
        buildError = err.message || 'Build failed';
      }

      return { ...result, isUpdate, status: buildStatus, buildError };
    }

    await BuilderSessionRepository.updateStatus(sessionId, userId, SESSION_STATUS.AWAITING_CONFIRM);
    return { ...result, isUpdate };
  },
};

// Back-compat shim: chat sessions persisted before the rename still reference
// the old tool name. Map it to the new handler so replays don't break.
builderToolHandlers.deploy_modular_bot = builderToolHandlers.save_modular_bot;

export { builderToolHandlers };
