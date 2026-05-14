const axios = require('axios');
const { json } = require('express');
const { ENVELOPE_SCHEMA } = require('./envelope-schema');

/**
 * Resolves environment variable references in config values
 * Replaces ${ENV_VAR} with process.env.ENV_VAR
 */
function resolveEnvVars(obj) {
    if (typeof obj === 'string') {
        const match = obj.match(/^\$\{(.+)\}$/);
        if (match) {
            const envVar = match[1];
            const value = process.env[envVar];
            if (!value) {
                throw new Error(`Environment variable ${envVar} is not set`);
            }
            return value;
        }
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(resolveEnvVars);
    }

    if (obj && typeof obj === 'object') {
        const resolved = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[key] = resolveEnvVars(value);
        }
        return resolved;
    }

    return obj;
}

/**
 * Base class for LLM providers
 */
class LLMAdapter {
    constructor(config) {
        this.config = resolveEnvVars(config);
        this.setupInterceptors();
    }

    setupInterceptors() {
        axios.interceptors.request.use(request => {
            const timestamp = new Date().toISOString();
            request.meta = request.meta || {};
            request.meta.requestTimestamp = timestamp;
            request.meta.requestStartedAt = Date.now();
            console.log(`[LLM CALL ${this.config.model}] ${request.method.toUpperCase()} ${request.baseURL || ''}${request.url} | Timestamp: ${timestamp}`);
            return request;
        });

        axios.interceptors.response.use(
            response => {
                const endTime = Date.now();
                const duration = endTime - response.config.meta.requestStartedAt;

                response.trace = {
                    requestTimestamp: response.config.meta.requestTimestamp,
                    responseTimestamp: new Date().toISOString(),
                    durationMs: duration,
                    method: response.config.method.toUpperCase(),
                    model: this.config.model,
                    url: `${response.config.baseURL || ''}${response.config.url}`
                };

                return response;
            },
            error => {
                if (error.config && error.config.meta) {
                    const endTime = Date.now();
                    const duration = endTime - error.config.meta.requestStartedAt;

                    error.trace = {
                        requestTimestamp: error.config.meta.requestTimestamp,
                        responseTimestamp: new Date().toISOString(),
                        durationMs: duration,
                        method: error.config.method.toUpperCase(),
                        url: `${error.config.baseURL || ''}${error.config.url}`,
                        error: true
                    };
                }
                throw error;
            }
        );
    }

    async generate(prompt) {
        throw new Error('generate() must be implemented by adapter');
    }
}

/**
 * Defense in depth: Ollama doesn't implement vision in this codebase. The
 * wizard gates the protocol toggle for unsupported providers, but a
 * misconfigured artifact (post-deploy provider swap, hand-edited config.json)
 * shouldn't silently drop the image.
 */
function rejectImage(adapterName, image) {
    if (image) {
        throw new Error(
            `${adapterName} adapter does not support vision input. Optical Read requires a vision-capable provider.`
        );
    }
}

/**
 * Ollama adapter - uses /api/chat for role-based messaging
 *
 * Envelope reliability: passes ENVELOPE_SCHEMA to Ollama's `format` parameter,
 * which the daemon (0.5+) compiles to a GBNF grammar via llama.cpp. The
 * sampler rejects tokens that would break the schema, so the model literally
 * cannot emit envelope-non-conforming output. Brings Ollama to the same
 * structural guarantee OpenAI and Anthropic adapters already provide.
 *
 * Older daemons silently ignore the schema object and behave as `format: 'json'`,
 * which is the prior behavior — degrades safely. The fallback synthesis path
 * in server.js stays in place as the safety net for that case.
 */
class OllamaAdapter extends LLMAdapter {
    constructor(config) {
        super(config);
        this._probeVersion();
    }

    async _probeVersion() {
        try {
            const r = await axios.get(`${this.config.host}/api/version`, { timeout: 5000 });
            const v = r.data?.version || '';
            const [maj, min] = v.split('.').map(Number);
            if (maj === 0 && min < 5) {
                console.warn(
                    `[OLLAMA] daemon ${v} < 0.5.0 — schema-constrained format ignored, ` +
                    `falling back to free-form JSON. Upgrade Ollama for envelope guarantees.`
                );
            }
        } catch (e) {
            // Non-fatal — daemon may not be up at adapter init time
        }
    }

    async generate(instructions, userPrompt, ragContext, conversationHistory, image = null) {
        rejectImage('Ollama', image);
        const url = `${this.config.host}/api/chat`;

        // Build history from previous conversation turns
        const history = (conversationHistory || []).flatMap(item => {
            try {
                const parsed = JSON.parse(item.llm_response);
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'assistant', content: parsed.answer || parsed.response || item.llm_response }
                ];
            } catch (e) {
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'assistant', content: item.llm_response || '' }
                ];
            }
        });

        // Build messages array with system context and user prompt
        const messages = [
            { role: 'system', content: instructions },
            { role: 'system', content: ragContext?.length > 1 ? ragContext : 'No documents found' },
            ...history,
            { role: 'user', content: userPrompt }
        ];

        const response = await axios.post(url, {
            model: this.config.model,
            messages: messages,
            // Grammar-constrained sampling against the canonical envelope shape.
            // Ollama 0.5+ compiles this to a GBNF grammar via llama.cpp; older
            // daemons silently ignore the object and behave as `format: 'json'`,
            // which is the prior behavior — degrades safely.
            format: ENVELOPE_SCHEMA,
            stream: this.config.stream || false,
            // Suppress hybrid-reasoning scratchpad (qwen3's <think> blocks).
            // Not part of constrained-decoding output but can leak on some
            // daemon versions if the flag is omitted.
            think: false,
            options: {
                // Conversation history + RAG context can push past Ollama's
                // default 2048-token window mid-conversation; window-overflow
                // failures look identical to schema mismatches and are easy
                // to misdiagnose.
                num_ctx: 16384,
            },
        }, {
            timeout: this.config.timeout || 300000
        });

        const raw = response.data.message?.content || '';
        const jsonString = raw.replace(/```json|```/g, '').trim();

        return {
            response: jsonString,
            trace: response.trace
        };
    }
}

/**
 * OpenAI adapter (Responses API)
 *
 * Prompt caching on OpenAI is automatic for prompts ≥1024 tokens on supported
 * models — there's no `cache_control` equivalent. We maximize hit rate by
 * keeping the developer-role prefix (instructions + RAG) byte-stable across
 * turns and emitting prior turns as discrete alternating-role messages rather
 * than a single mutating user blob.
 *
 * Optical Read: when `image` is set, the current user turn becomes a multipart
 * content array — input_image first (as a base64 data URL), input_text second.
 * Mirrors the Anthropic adapter's vision path so the same protocol cartridge
 * works on both providers. image=null short-circuits to the string-content shape.
 *
 * Envelope shape is requested in-prompt by the composed protocol cartridges,
 * not enforced at the wire. The runtime relies on `extractJSON` and the
 * fallback-synthesis branch in server.js to handle prose-leaning responses —
 * same contract as the Ollama adapter.
 */
class OpenAIAdapter extends LLMAdapter {
    async generate(instructions, userPrompt, ragContext, conversationHistory, image = null) {
        const url = `${this.config.baseURL}${this.config.endpoint}`;

        const history = (conversationHistory || []).flatMap(item => {
            try {
                const parsed = JSON.parse(item.llm_response);
                const assistantContent = parsed.answer || parsed.response || item.llm_response;
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'assistant', content: assistantContent }
                ];
            } catch (e) {
                console.error('Failed to parse conversation history item:', e.message);
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'assistant', content: item.llm_response || '' }
                ];
            }
        });

        const currentTurn = (image && image.base64 && image.mime)
            ? {
                role: 'user',
                content: [
                    { type: 'input_image', image_url: `data:${image.mime};base64,${image.base64}` },
                    { type: 'input_text', text: userPrompt }
                ]
            }
            : { role: 'user', content: userPrompt };

        const input = [
            { role: 'developer', content: instructions },
            { role: 'developer', content: ragContext?.length > 1 ? ragContext : 'No documents found' },
            ...history,
            currentTurn
        ];

        // gpt-5 family does internal reasoning by default, which adds seconds
        // per turn. The chat-runtime workload (envelope-shaped reply, no
        // math/code synthesis) doesn't benefit. `minimal` brings latency back
        // in line with non-reasoning models. Ignored by gpt-4.1 — safe to set
        // unconditionally.
        const response = await axios.post(url, {
            model: this.config.model,
            input,
            reasoning: { effort: 'minimal' },
        }, {
            timeout: this.config.timeout || 300000,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'OpenAI-Organization': this.config.organization,
                'Content-Type': 'application/json'
            }
        });

        const usage = response?.data?.usage;
        const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
        const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
        console.log(`[LLM CACHE ${this.config.model}] input=${inputTokens} cached=${cachedTokens}`);

        // gpt-5 prepends a `reasoning` item to `output[]` before the `message`
        // item; gpt-4.1 emits just the message. Scan for the message item
        // instead of indexing position 0 so both shapes work.
        const messageItem = response?.data?.output?.find((o) => o?.type === 'message');
        const content = messageItem?.content?.find((c) => typeof c?.text === 'string')?.text;
        return {
            response: content,
            trace: response.trace
        };
    }
}

/**
 * Anthropic adapter
 *
 * Optical Read uses the optional `image` parameter: when set, the current user
 * turn is rewritten as a multipart content array — image block first, text
 * second — which is what claude-3+ vision expects. Other call paths are
 * unaffected; image=null short-circuits to the original string-content shape.
 *
 * Envelope reliability: forced tool use against ENVELOPE_SCHEMA. The model
 * must call respond() with input matching the canonical envelope shape, which
 * makes the prose-not-JSON failure path (and the form-state-loss it triggers
 * in server.js's fallback) structurally impossible on this provider.
 */
class AnthropicAdapter extends LLMAdapter {
    async generate(instructions, userPrompt, ragContext, conversationHistory, image = null) {
        const url = `${this.config.baseURL}${this.config.endpoint}`;

        // Safely build history with error handling
        const history = (conversationHistory || []).flatMap(item => {
            try {
                const parsed = JSON.parse(item.llm_response);
                const assistantContent = parsed.answer || parsed.response || item.llm_response;
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'assistant', content: assistantContent }
                ];
            } catch (e) {
                console.error('Failed to parse conversation history item:', e.message);
                console.error('Raw llm_response:', item.llm_response);
                console.error('Response length:', item.llm_response?.length, '| Last 100 chars:', item.llm_response?.slice(-100));
                // Fall back to raw response if JSON parsing fails
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'assistant', content: item.llm_response || '' }
                ];
            }
        });

        // Current user turn: text-only by default; multipart with image-first
        // when an image is attached.
        if (image && image.base64 && image.mime) {
            history.push({
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: image.mime,
                            data: image.base64
                        }
                    },
                    { type: 'text', text: userPrompt }
                ]
            });
        } else {
            history.push({ role: 'user', content: userPrompt });
        }
        const systemInstructions = {
            type: "text",
            text: instructions,
            cache_control: { type: "ephemeral", ttl: "5m" }
        }
        const ragInstructions = {
            type: "text",
            text: ragContext.length > 1 ? ragContext : "No documents found",
            cache_control: { type: "ephemeral", ttl: "5m" }
        }

        // `tools` is listed first in the payload so the cache prefix covers
        // the schema; Anthropic caches by prefix, so reordering would invalidate
        // the existing system+RAG breakpoints. After this change the cache
        // layout is: [tools, system[0]=instructions, system[1]=RAG], with one
        // breakpoint left over for future use (e.g. conversation history).
        const response = await axios.post(url, {
            model: this.config.model,
            max_tokens: this.config.maxTokens || 4096,
            tools: [{
                name: 'respond',
                description:
                    'Send your reply to the user as a structured protocol envelope. ' +
                    'The `answer` field carries the user-facing message. Protocol-specific ' +
                    'state nests under `form` / `triage` / `appointment` / `extraction` — ' +
                    'include only the protocol object that applies to your reply.',
                input_schema: ENVELOPE_SCHEMA,
                cache_control: { type: 'ephemeral', ttl: '5m' }
            }],
            tool_choice: { type: 'tool', name: 'respond' },
            system: [
                systemInstructions,
                ragInstructions
            ],
            messages: history
        }, {
            timeout: this.config.timeout || 300000,
            headers: {
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            }
        });

        const usage = response?.data?.usage;
        const cachedTokens = usage?.cache_read_input_tokens ?? 0;
        const inputTokens = usage?.input_tokens ?? 0;
        console.log(`[LLM CACHE ${this.config.model}] input=${inputTokens} cached=${cachedTokens}`);

        const block = response.data.content.find(
            (c) => c.type === 'tool_use' && c.name === 'respond'
        );
        if (response.data.stop_reason === 'max_tokens' && !block) {
            throw new Error('Anthropic hit max_tokens before completing tool_use');
        }
        if (!block) {
            throw new Error('Anthropic response contained no respond() tool_use block');
        }
        const jsonString = JSON.stringify(block.input);

        return {
            response: jsonString,
            trace: response.trace
        };
    }
}

/**
 * Factory function to create appropriate adapter
 */
function createLLMClient(config) {
    const providerName = config.llm.provider;
    const providerConfig = config.llm[providerName];

    if (!providerConfig) {
        throw new Error(`Provider configuration for '${providerName}' not found in config`);
    }

    switch (providerName) {
        case 'ollama':
            return new OllamaAdapter(providerConfig);
        case 'openai':
            return new OpenAIAdapter(providerConfig);
        case 'anthropic':
            return new AnthropicAdapter(providerConfig);
        default:
            throw new Error(`Unsupported LLM provider: ${providerName}`);
    }
}

module.exports = { createLLMClient };