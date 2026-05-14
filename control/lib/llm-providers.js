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

/**
 * Per-model protocol allowlist.
 *
 * Ollama — qwen3 and mistral-nemo are small enough that multi-step
 * instruction-following (form-gathering, appointments, triage, optical-read)
 * is unreliable in practice; they can answer over a knowledge base but lose
 * the thread on stateful flows. llama3.3 (70B) handles everything.
 *
 * OpenAI — gpt-4.1 stays on form-free protocols. The form-gathering flow
 * needs the model to track field state across turns and follow stricter
 * shape guidance now that wire-level enforcement is gone; gpt-5 and
 * gpt-5-mini handle it reliably, gpt-4.1 doesn't. Anchor model otherwise.
 *
 * Returns `null` when all protocols are allowed (the common case). Returns a
 * `Set` of allowed protocol IDs when the model is restricted.
 *
 * Protocol IDs match the wizard's `enabledProtocols` keys: knowledge,
 * formGathering, appointments, triage, opticalRead.
 */
const RESTRICTED_OLLAMA_MODELS = new Set(['qwen3', 'mistral-nemo']);
const RESTRICTED_OPENAI_MODELS = new Set(['gpt-4.1']);

export function getAllowedProtocolsForModel(provider, model) {
  if (provider === 'ollama' && RESTRICTED_OLLAMA_MODELS.has(model)) {
    return new Set(['knowledge']);
  }
  if (provider === 'openai' && RESTRICTED_OPENAI_MODELS.has(model)) {
    return new Set(['knowledge', 'appointments', 'triage', 'opticalRead']);
  }
  return null;
}

export function isProtocolAllowedForModel(provider, model, protocolId) {
  const allowed = getAllowedProtocolsForModel(provider, model);
  if (!allowed) return true;
  return allowed.has(protocolId);
}

export const LLM_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    // User-facing model picker. `gpt-4.1-mini` and `gpt-4.1-nano` are
    // intentionally absent here — `MODEL_TIERS` still resolves to them for
    // control-plane tasks (form-gen, RAG summary), but they're not surfaced
    // as bot-runtime options. `gpt-4.1` is the anchor.
    models: ['gpt-4.1', 'gpt-5', 'gpt-5-mini'],
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
    // Not surfaced in the UI yet. The provider is wired end-to-end (settings,
    // wizard branch, generateSummary/generateStructured, deployer) but stays
    // hidden until we're ready to support it publicly. Consumers that render
    // a provider picker should filter on this flag; code paths keyed on
    // `provider === 'bedrock'` continue to work for anyone driving the API
    // directly.
    hidden: true,
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
    // Opinionated short list: all three are tool-capable in Ollama and have
    // strong instruction-following for the envelope JSON shape. Plain mistral
    // (7B, non-tool-capable) is intentionally omitted — users who want it can
    // still pick a tool-capable model and pull it with `ollama pull <model>`.
    // llama3.3 (70B) is the heaviest local option here — only viable on
    // machines with the VRAM/unified memory to run a 70B model at usable
    // speed; smaller hosts should stick to qwen3 or mistral-nemo.
    models: ['qwen3', 'mistral-nemo', 'llama3.3'],
    defaultModel: 'llama3.3',
    // Canonical Ollama endpoint. We don't bundle Ollama — users run their
    // own. This default works from the control plane (native Node) without
    // assuming any topology. The bot artifact (Docker) needs a different
    // host to reach the user's Ollama: `host.docker.internal:11434` on
    // Mac/Windows, the host's LAN IP on Linux. The wizard helper text calls
    // this out so savvy users override deliberately rather than getting a
    // Docker-shaped default they didn't ask for.
    defaultHost: 'http://localhost:11434',
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
  ollama: {
    // Single model across tiers — Ollama is local/free, so the cost-driven
    // reasoning/structured/summary split that the cloud providers use doesn't
    // apply. llama3.3 is natively tool-tuned (no <think> scratchpad to strip),
    // handles grammar-constrained JSON via Ollama's `format` param, and writes
    // clean prose — one warm model covers all three workloads. Note: it's a
    // 70B model, so it only runs at usable speed on machines with the VRAM /
    // unified memory to host it. Smaller hosts should override to qwen3 or
    // mistral-nemo via the wizard.
    reasoning: 'llama3.3',
    structured: 'llama3.3',
    summary: 'llama3.3',
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
 * Resolve an Ollama host URL from the `apiKey` parameter passed through the
 * shared generate*() entry points. The slot can carry one of three shapes:
 *
 *   - JSON `{"host":"http://..."}` — settings-resolved saved key
 *   - bare URL string `http://...` — direct caller without saved key
 *   - empty / null              — fall back to LLM_PROVIDERS.ollama.defaultHost
 *
 * Same pattern as Bedrock's `JSON.parse(apiKey)` discriminator; keeps the
 * outer function signatures stable across providers.
 *
 * The host stored in deployment configs is intended for the bot artifact,
 * which runs in Docker and reaches the host via `host.docker.internal`. The
 * control plane (this code) usually runs natively (`npm run dev`) where that
 * alias doesn't resolve. Two escape hatches:
 *
 *   1. process.env.OLLAMA_HOST wins outright — set this when the control
 *      plane needs a different endpoint than the bot artifact (Dockerized
 *      control plane, remote Ollama, tunneled endpoint).
 *   2. Otherwise, rewrite `host.docker.internal` → `localhost` so a
 *      stock-default deployment config works from a native control plane
 *      without configuration. Set OLLAMA_HOST explicitly if you actually
 *      want the control plane to use the Docker alias.
 */
export function resolveOllamaHost(apiKey) {
  const envOverride = process.env.OLLAMA_HOST?.trim();
  if (envOverride) return envOverride;

  const fallback = LLM_PROVIDERS.ollama?.defaultHost || 'http://host.docker.internal:11434';
  let resolved = fallback;
  if (apiKey) {
    const trimmed = String(apiKey).trim();
    if (trimmed) {
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          resolved = parsed.host || fallback;
        } catch {
          resolved = fallback;
        }
      } else {
        resolved = trimmed;
      }
    }
  }
  return resolved.replace(/host\.docker\.internal/gi, 'localhost');
}

/**
 * Generate summary using specified LLM provider
 * @param {string} provider - The LLM provider (openai, anthropic, bedrock, ollama)
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

    case 'ollama': {
      const host = resolveOllamaHost(apiKey);
      return await generateSummaryWithOllama(content, host, systemInstruction, selectedModel);
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
 * Strip hybrid-reasoning scratchpad tags from Ollama model output. qwen3
 * (and other hybrid-thinking models) emit `<think>...</think>` blocks before
 * their actual answer; downstream call sites want clean prose. We pass
 * `think: false` in the request as the canonical suppression, but keep this
 * as defense in depth for models that ignore it or for older Ollama versions.
 */
function stripReasoningTags(text) {
  if (!text) return text;
  // Strip both well-formed and unterminated <think> blocks.
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/i, '')
    .trim();
}

/**
 * Generate summary via Ollama /api/chat. Free-text return; no JSON-mode hint
 * because the call sites in tool-executors want prose digests, not structured
 * output. Caller passes the resolved host directly.
 */
async function generateSummaryWithOllama(content, host, systemInstruction, model) {
  const url = `${host.replace(/\/$/, '')}/api/chat`;
  const hasContent = content && content.trim().length > 0;

  // Ollama doesn't expose a separate `system` field; the system role inside
  // messages is the supported shape and matches what the bot-runtime adapter
  // sends in lite-template/helper/llm-client.js.
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      // Hybrid-reasoning models (qwen3) emit <think> scratchpad unless told
      // to skip it. This flag is Ollama's official switch; ignored by
      // non-thinking models, so it's safe to set unconditionally.
      think: false,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: hasContent ? content : systemInstruction },
      ],
      options: {
        // Bump the context window above Ollama's default 2048 — the chat
        // builder's summary prompts can run past 4K when documents are large.
        num_ctx: 16384,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Ollama API error (${response.status}): ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const raw = data?.message?.content;
  if (!raw || typeof raw !== 'string') {
    throw new Error('Ollama response contained no message.content');
  }
  return stripReasoningTags(raw) || 'No summary generated';
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

    case 'ollama': {
      const host = resolveOllamaHost(apiKey);
      return await generateStructuredWithOllama(content, host, systemInstruction, selectedModel, schema);
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

/**
 * Generate a structured object via Ollama /api/chat with grammar-constrained
 * sampling against the caller-supplied JSON schema.
 *
 * Ollama 0.5+ compiles the `format` schema into a GBNF grammar at the daemon
 * and constrains token sampling to it — the model cannot emit non-conforming
 * output. We initially tried pairing `format` with forced tool use to match
 * the OpenAI/Anthropic response shape, but that combo caused the model to
 * emit the constrained JSON into `message.content` and bypass the tool-call
 * channel entirely. So this path drops the tool wrapper and reads
 * `message.content` directly.
 *
 * Caveats:
 *   - Requires Ollama ≥ 0.5.0. Older daemons silently ignore the schema and
 *     return free-form JSON, which surfaces here as a parse error if the
 *     model's free-form output doesn't match what the caller expects.
 *   - No prompt caching. Every call re-processes the full system prompt +
 *     schema. Acceptable for one-shot structured calls.
 */
async function generateStructuredWithOllama(content, host, systemInstruction, model, schema) {
  const url = `${host.replace(/\/$/, '')}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      // Suppress hybrid-reasoning scratchpad on qwen3 — wasted tokens on the
      // structured-output path where the model should emit the JSON directly.
      think: false,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content },
      ],
      // Grammar-constrained sampling against the caller's schema. Daemon-side
      // guarantee that `message.content` parses as a JSON object matching the
      // schema. No `tools` — pairing `format` with forced tool use causes the
      // constrained output to land in `content` instead of the tool call.
      format: schema,
      options: {
        num_ctx: 16384,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Ollama API error (${response.status}): ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const raw = data?.message?.content;
  if (!raw || typeof raw !== 'string') {
    throw new Error('Ollama response contained no message.content');
  }
  // Defense in depth — grammar-constrained output should never carry markdown
  // fences, but some daemon/model combos emit them anyway. Cheap to strip.
  const jsonString = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`Ollama returned malformed JSON: ${e.message}. Content: ${jsonString.slice(0, 200)}`);
  }
}
