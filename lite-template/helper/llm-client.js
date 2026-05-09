const axios = require('axios');
const { json } = require('express');

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
 * Defense in depth for v1: only the Anthropic adapter implements vision.
 * The wizard gates the protocol toggle so an OpenAI/Gemini/etc. bot can never
 * reach this code path, but a misconfigured artifact (post-deploy provider
 * swap, hand-edited config.json) shouldn't silently drop the image.
 */
function rejectImage(adapterName, image) {
    if (image) {
        throw new Error(
            `${adapterName} adapter does not support vision input. Optical Read requires the Anthropic provider in v1.`
        );
    }
}

/**
 * Ollama adapter - uses /api/chat for role-based messaging
 */
class OllamaAdapter extends LLMAdapter {
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
            format: this.config.format || 'json',
            stream: this.config.stream || false
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
 * OpenAI adapter
 */
class OpenAIAdapter extends LLMAdapter {
    async generate(instructions, userPrompt, ragContext, conversationHistory, image = null) {
        rejectImage('OpenAI', image);
        const url = `${this.config.baseURL}${this.config.endpoint}`;
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
        const historyString = JSON.stringify(history)
        
        const response = await axios.post(url, {
            model: this.config.model,
            input: [
                {
                    role: "developer",
                    content: instructions
                },
                {
                    role: "developer",
                    content: ragContext
                },
                {
                    role: "user",
                    content: historyString
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ]
        }, {
            timeout: this.config.timeout || 300000,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'OpenAI-Organization': this.config.organization,
                'Content-Type': 'application/json'
            }
        });

        const content = response?.data?.output[0]?.content[0]?.text
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

        const response = await axios.post(url, {
            model: this.config.model,
            max_tokens: this.config.maxTokens || 4096,
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

        const content = response.data.content[0]
        const raw = content.text;
        const jsonString = raw.replace(/```json|```/g, '').trim();

        return {
            response: jsonString,
            trace: response.trace
        };
    }
}

/**
 * Gemini adapter
 */
class GeminiAdapter extends LLMAdapter {
    async generate(instructions, userPrompt, ragContext, conversationHistory, image = null) {
        rejectImage('Gemini', image);
        const url = `${this.config.baseURL}${this.config.model}${this.config.endpoint}`;
        const history = (conversationHistory || []).flatMap(item => {
            try {
                const parsed = JSON.parse(item.llm_response);
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'model', content: parsed.answer || parsed.response || item.llm_response }
                ];
            } catch (e) {
                return [
                    { role: 'user', content: item.user_prompt },
                    { role: 'model', content: item.llm_response || '' }
                ];
            }
        });
        const historyString = JSON.stringify(history)
        
        const response = await axios.post(url, {
            contents: [
                {
                    role: "model",
                    parts: [
                        { text: instructions }
                    ]
                },
                ragContext && {
                    role: "model",
                    parts: [
                        { text: ragContext }
                    ]
                },
                historyString && {
                    role: "model",
                    parts: [
                        { text: historyString }
                    ]
                },
                {
                    role: "user",
                    parts: [
                        { text: userPrompt }
                    ]
                }
            ]
        }, {
            timeout: this.config.timeout || 300000,
            headers: {
                'x-goog-api-key': this.config.apiKey,
                'Content-Type': 'application/json'
            }
        });
        
        const candidates = response.data.candidates[0]
        const content = candidates.content.parts[0]
        const raw = content.text;
        const jsonString = raw.replace(/```json|```/g, '').trim();
        
        return {
            response: jsonString,
            trace: response.trace
        };
    }
}

/**
 * Cohere adapter
 */
class CohereAdapter extends LLMAdapter {
    async generate(instructions, userPrompt, ragContext, conversationHistory, image = null) {
        rejectImage('Cohere', image);
        const url = `${this.config.baseURL}${this.config.endpoint}`;

        // Safely build history with error handling
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

        // Add current user prompt
        history.push({ role: 'user', content: userPrompt });
        const systemInstructions = {
            role: "system",
            content: instructions,
        }
        const ragInstructions = {
            role: "system",
            content: ragContext.length > 1 ? ragContext : "No documents found",
        }
        history.push(systemInstructions)
        history.push(ragInstructions)
        console.log(history)
        const response = await axios.post(url, {
            model: this.config.model,
            max_tokens: this.config.maxTokens || 4096,
            messages: history
        }, {
            timeout: this.config.timeout || 300000,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(response)
        const content = response.data.message.content[0]
        const raw = content.text;
        const jsonString = raw.replace(/```json|```/g, '').trim();
        
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
        case 'gemini':
            return new GeminiAdapter(providerConfig);
        case 'cohere':
            return new CohereAdapter(providerConfig);
        default:
            throw new Error(`Unsupported LLM provider: ${providerName}`);
    }
}

module.exports = { createLLMClient };