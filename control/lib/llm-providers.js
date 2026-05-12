/**
 * LLM Provider Configurations
 * Shared between ConfigForm and config-builder
 */

/**
 * Providers whose runtime adapter accepts image input on the current user
 * turn. Optical Read and any future vision-using protocol gate themselves
 * against this set — keep it in sync with the adapters in
 * lite-template/helper/llm-client.js.
 */
export const VISION_PROVIDERS = new Set(['anthropic', 'openai']);

export function providerSupportsVision(provider) {
  return VISION_PROVIDERS.has(provider);
}

export const LLM_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4.1',
    baseURL: 'https://api.openai.com/v1',
    endpoint: '/responses'
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-6',
    baseURL: 'https://api.anthropic.com/v1',
    endpoint: '/messages'
  },
  bedrock: {
    name: 'AWS Bedrock (Claude)',
    // Base model IDs without geographic prefix - prefix is added dynamically based on region
    models: [
      { id: 'anthropic.claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'anthropic.claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'anthropic.claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'anthropic.claude-opus-4-5', name: 'Claude Opus 4.5' },
      { id: 'anthropic.claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    defaultModel: 'anthropic.claude-sonnet-4-6',
    // Regions grouped by geographic prefix for cross-region inference
    regions: [
      { id: 'us-east-1', name: 'US East (N. Virginia)', geoPrefix: 'us' },
      { id: 'us-west-2', name: 'US West (Oregon)', geoPrefix: 'us' },
      { id: 'eu-west-1', name: 'Europe (Ireland)', geoPrefix: 'eu' },
      { id: 'eu-central-1', name: 'Europe (Frankfurt)', geoPrefix: 'eu' },
      { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', geoPrefix: 'apac' },
      { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', geoPrefix: 'apac' },
    ],
    authModes: ['credentials', 'iam-role'],
  },
  ollama: {
    name: 'Ollama (local)',
    // Opinionated short list: both models are tool-capable in Ollama and have
    // strong instruction-following for the envelope JSON shape. Plain mistral
    // (7B, non-tool-capable) is intentionally omitted — users who want it can
    // still pick a tool-capable model and pull it with `ollama pull <model>`.
    models: ['qwen3', 'mistral-nemo'],
    defaultModel: 'qwen3',
    // The bot container reaches the host's Ollama via host.docker.internal on
    // Mac/Windows. Linux users need extra_hosts in docker-compose.yml or a LAN
    // IP — surfaced in the wizard helper text rather than auto-detected.
    defaultHost: 'http://host.docker.internal:11434',
  }
};

/**
 * Per-task model tiers. The "default" API key (isDefault flag on api_keys)
 * picks a provider; this map picks the right model within that provider for
 * the workload at hand. User-facing semantics of "default" are unchanged.
 *
 *   reasoning   — agentic loops with tool use (chat builder)
 *   structured  — single-shot calls bounded by a JSON schema (form gen)
 *   summary     — single-shot free-text generation (RAG / bot summary)
 *
 * Bedrock uses base model IDs without the geographic prefix — buildBedrockModelId
 * adds the prefix at the wire.
 */
export const MODEL_TIERS = {
  openai: {
    reasoning: 'gpt-4.1',
    structured: 'gpt-4.1-mini',
    summary: 'gpt-4.1-mini',
  },
  anthropic: {
    reasoning: 'claude-sonnet-4-6',
    structured: 'claude-haiku-4-5',
    summary: 'claude-haiku-4-5',
  },
  bedrock: {
    reasoning: 'anthropic.claude-sonnet-4-6',
    structured: 'anthropic.claude-haiku-4-5',
    summary: 'anthropic.claude-haiku-4-5',
  },
};

/**
 * Pick the default model for a (provider, task) pair. Falls back to the
 * provider's flat `defaultModel` if the tier is missing — never throws.
 *
 * @param {string} provider — openai | anthropic | bedrock
 * @param {string} task     — reasoning | structured | summary
 * @returns {string | undefined}
 */
export function getDefaultModelForTask(provider, task) {
  return MODEL_TIERS[provider]?.[task] || LLM_PROVIDERS[provider]?.defaultModel;
}

/**
 * Get default Bedrock region from environment or fallback
 * @returns {string} Default AWS region for Bedrock
 */
export function getDefaultBedrockRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
}

/**
 * Get geographic prefix for cross-region inference based on AWS region
 * @param {string} region - AWS region ID (e.g., 'us-east-1')
 * @returns {string} Geographic prefix (e.g., 'us', 'eu', 'apac')
 */
export function getBedrockGeoPrefix(region) {
  // Handle undefined/null region - default to 'us'
  if (!region) {
    return 'us';
  }

  const regionConfig = LLM_PROVIDERS.bedrock.regions.find(r => r.id === region);
  if (regionConfig?.geoPrefix) {
    return regionConfig.geoPrefix;
  }

  // Fallback mapping for regions not in the list
  if (region.startsWith('us-') || region.startsWith('ca-')) return 'us';
  if (region.startsWith('eu-') || region.startsWith('il-')) return 'eu';
  if (region.startsWith('ap-') || region.startsWith('me-')) return 'apac';

  // Default to 'us' if unknown
  return 'us';
}

/**
 * Build the full Bedrock model ID with geographic prefix for cross-region inference
 * @param {string} baseModelId - Base model ID without prefix (e.g., 'anthropic.claude-sonnet-4-6')
 * @param {string} region - AWS region ID (e.g., 'us-east-1')
 * @returns {string} Full model ID with prefix (e.g., 'us.anthropic.claude-sonnet-4-6')
 */
export function buildBedrockModelId(baseModelId, region) {
  // If already prefixed (starts with us., eu., apac.), return as-is
  if (/^(us|eu|apac)\./.test(baseModelId)) {
    return baseModelId;
  }
  const geoPrefix = getBedrockGeoPrefix(region);
  return `${geoPrefix}.${baseModelId}`;
}

/**
 * Strip the geographic prefix from a Bedrock model ID
 * @param {string} modelId - Full model ID (e.g., 'us.anthropic.claude-sonnet-4-6')
 * @returns {string} Base model ID without prefix (e.g., 'anthropic.claude-sonnet-4-6')
 */
export function stripBedrockModelPrefix(modelId) {
  if (!modelId) return modelId;
  // Remove geographic prefix (us., eu., apac.) if present
  return modelId.replace(/^(us|eu|apac)\./, '');
}

/**
 * Generate summary using specified LLM provider
 * @param {string} provider - The LLM provider (openai, anthropic, bedrock)
 * @param {string} content - The content to summarize
 * @param {string} apiKey - The API key for the provider
 * @param {string} customPrompt - Optional custom prompt
 * @param {string} model - Optional model override
 * @returns {Promise<string>} - The generated summary
 */
export async function generateSummary(provider, content, apiKey, customPrompt = null, model = null) {
  const providerConfig = LLM_PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const selectedModel = model || providerConfig.defaultModel;

  const defaultPrompt = `You are a helpful RAG (Retrieval-Augmented Generation) assistant. Analyze the following documents and provide a concise summary that:

1. Identifies key terms, concepts, and topics covered
2. Highlights the main themes and subject areas
3. Describes what kind of questions this knowledge base can answer
4. Lists important entities, processes, or procedures mentioned

IMPORTANT: Generate the summary in the SAME LANGUAGE as the original document. If the document is in French, write the summary in French. If in German, write in German. Match the source language exactly.

Keep the summary clear, structured, and focused on what information is available in these documents.`;

  const systemInstruction = customPrompt || defaultPrompt;

  switch (provider) {
    case 'openai':
      return await generateSummaryWithOpenAI(content, apiKey, systemInstruction, selectedModel, providerConfig);

    case 'anthropic':
      return await generateSummaryWithAnthropic(content, apiKey, systemInstruction, selectedModel, providerConfig);

    case 'bedrock': {
      // For Bedrock, apiKey is actually JSON credentials
      let credentials;
      try {
        credentials = JSON.parse(apiKey);
      } catch (e) {
        throw new Error('Invalid Bedrock credentials format. Please reconfigure your AWS credentials.');
      }
      if (!credentials.region) {
        credentials.region = 'us-east-1'; // Fallback region
      }
      return await generateSummaryWithBedrock(content, credentials, systemInstruction, selectedModel);
    }

    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}

/**
 * Generate summary using OpenAI API
 */
async function generateSummaryWithOpenAI(content, apiKey, systemInstruction, model, config) {
  const url = `${config.baseURL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: systemInstruction
        },
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 4096
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No summary generated';
}

/**
 * Generate summary using Anthropic API
 */
async function generateSummaryWithAnthropic(content, apiKey, systemInstruction, model, config) {
  const url = `${config.baseURL}${config.endpoint}`;

  // If content is empty, use systemInstruction as the user message
  // Anthropic API requires non-empty content in all messages
  const hasContent = content && content.trim().length > 0;

  const body = {
    model: model,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: hasContent ? content : systemInstruction
      }
    ]
  };

  // Only include system prompt if we have separate content
  if (hasContent) {
    body.system = systemInstruction;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || 'No summary generated';
}

/**
 * Generate summary using AWS Bedrock API
 */
async function generateSummaryWithBedrock(content, credentials, systemInstruction, model) {
  const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');

  const clientConfig = { region: credentials.region };

  // Only set explicit credentials if not using IAM role
  if (!credentials.useIamRole && credentials.accessKeyId) {
    clientConfig.credentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    };
  }

  const client = new BedrockRuntimeClient(clientConfig);

  // Build the full model ID with geographic prefix for cross-region inference
  const fullModelId = buildBedrockModelId(model, credentials.region);

  // If content is empty, use systemInstruction as the user message
  const hasContent = content && content.trim().length > 0;

  const command = new ConverseCommand({
    modelId: fullModelId,
    system: hasContent ? [{ text: systemInstruction }] : undefined,
    messages: [{ role: 'user', content: [{ text: hasContent ? content : systemInstruction }] }],
    inferenceConfig: { maxTokens: 4096 },
  });

  try {
    const response = await client.send(command);
    const textBlock = response.output?.message?.content?.find(b => b.text);
    return textBlock?.text || 'No summary generated';
  } catch (error) {
    // Provide more helpful error messages for common Bedrock errors
    if (error.name === 'AccessDeniedException') {
      throw new Error(`Bedrock access denied: ${error.message}. Check your AWS credentials and model access permissions.`);
    }
    if (error.name === 'ValidationException') {
      throw new Error(`Bedrock validation error: ${error.message}. Model ID: ${fullModelId}`);
    }
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Bedrock model not found: ${fullModelId}. Ensure the model is available in region ${credentials.region}.`);
    }
    if (error.name === 'ThrottlingException') {
      throw new Error('Bedrock rate limit exceeded. Please try again in a few moments.');
    }
    throw new Error(`Bedrock API error: ${error.message}`);
  }
}

/**
 * Generate a structured object using specified LLM provider.
 *
 * Unlike generateSummary (free-text return), this routes each provider
 * through its native structured-output primitive against a caller-supplied
 * JSON schema and returns a parsed object. The model cannot return prose
 * or malformed JSON — schema validity is enforced at the API contract.
 *
 *   openai    — Chat Completions response_format: json_schema (strict)
 *   anthropic — tool_choice forcing a specific tool whose input_schema = schema
 *   bedrock   — Converse toolConfig with toolChoice forcing the same shape
 *
 * @param {string} provider          One of: openai, anthropic, bedrock
 * @param {string} content           User-role content (the NL request)
 * @param {string} apiKey            API key or JSON-encoded Bedrock credentials
 * @param {string} systemInstruction System prompt
 * @param {object} schema            JSON schema describing the expected object
 * @param {string} [model]           Optional model override
 * @returns {Promise<object>} Parsed object conforming to `schema`
 */
export async function generateStructured(provider, content, apiKey, systemInstruction, schema, model = null) {
  const providerConfig = LLM_PROVIDERS[provider];
  if (!providerConfig) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const selectedModel = model || providerConfig.defaultModel;

  switch (provider) {
    case 'openai':
      return await generateStructuredWithOpenAI(content, apiKey, systemInstruction, selectedModel, providerConfig, schema);

    case 'anthropic':
      return await generateStructuredWithAnthropic(content, apiKey, systemInstruction, selectedModel, providerConfig, schema);

    case 'bedrock': {
      let credentials;
      try {
        credentials = JSON.parse(apiKey);
      } catch (e) {
        throw new Error('Invalid Bedrock credentials format. Please reconfigure your AWS credentials.');
      }
      if (!credentials.region) {
        credentials.region = 'us-east-1';
      }
      return await generateStructuredWithBedrock(content, credentials, systemInstruction, selectedModel, schema);
    }

    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}

/**
 * Generate a structured object via OpenAI Chat Completions response_format.
 * Caller is responsible for passing a strict-mode-compatible schema.
 */
async function generateStructuredWithOpenAI(content, apiKey, systemInstruction, model, config, schema) {
  const url = `${config.baseURL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user',   content },
      ],
      max_tokens: 4096,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'form_structure', schema, strict: true },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (choice?.finish_reason === 'length') {
    throw new Error('OpenAI hit max_tokens before completing structured output');
  }
  if (choice?.message?.refusal) {
    throw new Error(`OpenAI refused: ${choice.message.refusal}`);
  }

  const text = choice?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('OpenAI response contained no content');
  }
  return JSON.parse(text);
}

/**
 * Generate a structured object via Anthropic forced tool use. Schema is
 * consumed verbatim — Anthropic's tool input_schema validator accepts the
 * canonical (non-strict) shape.
 */
async function generateStructuredWithAnthropic(content, apiKey, systemInstruction, model, config, schema) {
  const url = `${config.baseURL}${config.endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      tools: [{
        name: 'generate_form',
        description: 'Return the generated form structure as a structured object.',
        input_schema: schema,
      }],
      tool_choice: { type: 'tool', name: 'generate_form' },
      system: systemInstruction,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const block = data.content?.find((c) => c.type === 'tool_use' && c.name === 'generate_form');

  if (data.stop_reason === 'max_tokens' && !block) {
    throw new Error('Anthropic hit max_tokens before completing tool_use');
  }
  if (!block) {
    throw new Error('Anthropic response contained no generate_form tool_use block');
  }
  return block.input;
}

/**
 * Generate a structured object via Bedrock Converse tool use. Mirrors the
 * error-mapping behavior of generateSummaryWithBedrock so credential and
 * model-access failures surface the same way across both code paths.
 */
async function generateStructuredWithBedrock(content, credentials, systemInstruction, model, schema) {
  const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');

  const clientConfig = { region: credentials.region };
  if (!credentials.useIamRole && credentials.accessKeyId) {
    clientConfig.credentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    };
  }

  const client = new BedrockRuntimeClient(clientConfig);
  const fullModelId = buildBedrockModelId(model, credentials.region);

  const command = new ConverseCommand({
    modelId: fullModelId,
    system: [{ text: systemInstruction }],
    messages: [{ role: 'user', content: [{ text: content }] }],
    inferenceConfig: { maxTokens: 4096 },
    toolConfig: {
      tools: [{
        toolSpec: {
          name: 'generate_form',
          description: 'Return the generated form structure as a structured object.',
          inputSchema: { json: schema },
        },
      }],
      toolChoice: { tool: { name: 'generate_form' } },
    },
  });

  try {
    const result = await client.send(command);

    if (result.stopReason === 'max_tokens') {
      throw new Error('Bedrock hit max_tokens before completing tool use');
    }
    const block = result.output?.message?.content?.find((c) => c.toolUse?.name === 'generate_form');
    if (!block) {
      throw new Error('Bedrock response contained no generate_form toolUse block');
    }
    return block.toolUse.input;
  } catch (error) {
    if (error.name === 'AccessDeniedException') {
      throw new Error(`Bedrock access denied: ${error.message}. Check your AWS credentials and model access permissions.`);
    }
    if (error.name === 'ValidationException') {
      throw new Error(`Bedrock validation error: ${error.message}. Model ID: ${fullModelId}`);
    }
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Bedrock model not found: ${fullModelId}. Ensure the model is available in region ${credentials.region}.`);
    }
    if (error.name === 'ThrottlingException') {
      throw new Error('Bedrock rate limit exceeded. Please try again in a few moments.');
    }
    throw error;
  }
}
