/**
 * Mojulo-Lite — Builder Streaming Endpoint (Inverted Flow)
 *
 * Adapted from dragbot-control:
 * - Single-user auth stub
 * - SQLite-backed repositories
 * - No bot-space / no org settings (null-coalesces in buildPreloadedContext)
 * - No billing / no rate limiting (checkRateLimit is a no-op)
 */

import { getCurrentUser } from '@/lib/auth/service';
import {
  BuilderSessionRepository,
  SESSION_STATUS,
} from '@/lib/db/repositories/builderSessions';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';
import { BUILDER_TOOLS, TOOL_LABELS } from '@/lib/builder/tools';
import { executeBuilderTool } from '@/lib/builder/tool-executors';
import {
  buildBuilderSystemPrompt,
  buildBuilderContinuationPrompt,
  buildBuilderEditPrompt,
} from '@/lib/builder/system-prompt';
import { parseModularDeploymentConfig } from '@/lib/config-builder';
import { auditLog } from '@/lib/audit-logger-new';
import { checkRateLimit, RateLimitPresets } from '@/lib/rate-limiter';
import { parseDocument } from '@/lib/document-parser';
import { buildBedrockModelId, getDefaultModelForTask, resolveOllamaHost } from '@/lib/llm-providers';
import { uploadFile } from '@/lib/storage';
import { decryptApiKey } from '@/lib/deployment-auth';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 10;
const TOOL_LOOP_DELAY_MS = 500;

const EventTypes = {
  SESSION: 'session',
  STATUS_CHANGE: 'status_change',
  TEXT: 'text',
  MODULO_EXPRESSION: 'modulo_expression',
  DOCUMENT_PROCESSING: 'document_processing',
  DOCUMENT_UPLOADED: 'document_uploaded',
  DOCUMENT_ERROR: 'document_error',
  TOOL_STARTED: 'tool_started',
  TOOL_PROGRESS: 'tool_progress',
  TOOL_COMPLETED: 'tool_completed',
  TOOL_FAILED: 'tool_failed',
  INFERENCE_COMPLETE: 'inference_complete',
  PROTOCOLS_RECOMMENDED: 'protocols_recommended',
  IDENTITY_COMPOSED: 'identity_composed',
  PROMPTS_SET: 'prompts_set',
  BOT_SUMMARY_GENERATED: 'bot_summary_generated',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  DEPLOYMENT_STARTED: 'deployment_started',
  DEPLOYMENT_PROGRESS: 'deployment_progress',
  DEPLOYMENT_COMPLETE: 'deployment_complete',
  DEPLOYMENT_FAILED: 'deployment_failed',
  DONE: 'done',
  ERROR: 'error',
};

function sendEvent(controller, encoder, type, data) {
  const event = { type, ...data, timestamp: Date.now() };
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

async function getLLMConfigForBuilder(session, userId) {
  const { defaultProvider, defaultApiKeyId, defaultModel } =
    session.preloadedContext || {};

  const apiKeys = await ApiKeyRepository.findByUserId(userId);

  let apiKeyRecord;
  if (defaultApiKeyId) {
    apiKeyRecord = apiKeys.find((k) => k.id === defaultApiKeyId);
  }
  if (!apiKeyRecord && defaultProvider) {
    apiKeyRecord = apiKeys.find((k) => k.provider === defaultProvider);
  }

  if (!apiKeyRecord) {
    // Local-only inference (ollama) sits last so a user with both cloud
    // and Ollama keys doesn't get silently routed to the slower lane —
    // ollama selection happens via isDefault, not by accident.
    const fallbackOrder = ['anthropic', 'bedrock', 'openai', 'ollama'];
    for (const provider of fallbackOrder) {
      apiKeyRecord = apiKeys.find((k) => k.provider === provider);
      if (apiKeyRecord) break;
    }
  }

  if (!apiKeyRecord) {
    throw new Error(
      'No API key configured. Add one at /settings before launching the chat builder.'
    );
  }

  return {
    provider: apiKeyRecord.provider,
    apiKey: decryptApiKey(apiKeyRecord.encryptedKey),
    model: defaultModel || getDefaultModelForTask(apiKeyRecord.provider, 'reasoning'),
  };
}

async function buildPreloadedContext(userId) {
  const [documents, apiKeys] = await Promise.all([
    DocumentRepository.findByBotSpaceId(null),
    ApiKeyRepository.findByUserId(userId),
  ]);

  const existingBots = await DeploymentRepository.list();

  let defaultProvider, defaultModel, defaultApiKeyId;
  const defaultKey = apiKeys.find((k) => k.isDefault) || apiKeys[0];
  if (defaultKey) {
    defaultProvider = defaultKey.provider;
    defaultModel = getDefaultModelForTask(defaultKey.provider, 'reasoning');
    defaultApiKeyId = defaultKey.id;
  } else {
    defaultProvider = 'anthropic';
    defaultModel = CLAUDE_MODEL;
  }

  return {
    organizationName: 'Local',
    workspaceName: 'Mojulo-Lite',
    workspaceDocuments: documents.map((d) => ({
      id: d.id,
      name: d.originalName,
      mimeType: d.mimeType,
    })),
    // Registered bots: ready + URL-connected. These are the routable targets
    // surfaced to Claude in the system prompt, used by the conversational
    // builder to compose triage routes against `botSummary`.
    existingBots: existingBots
      .filter((d) => d.status === 'ready' && d.url)
      .map((d) => ({
        botName: d.botName,
        id: d.id,
        url: d.url,
        botSummary: d.config?.botSummary || null,
      })),
    defaultProvider,
    defaultModel,
    defaultApiKeyId,
    apiKeys: apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
    })),
    disableModuloAnimation: false,
  };
}

export async function POST(request) {
  const rateLimit = checkRateLimit(request, {
    ...RateLimitPresets.expensive,
    keyPrefix: 'builder:stream',
  });
  if (!rateLimit.allowed) return rateLimit.response;

  try {
    const user = await getCurrentUser();

    // Gate: Lite's chat builder (and the per-bot artifact it compiles) cannot
    // function without an LLM provider key. Fail fast with 409 so the UI can
    // surface the /settings deep-link.
    const availableKeys = await ApiKeyRepository.findByUserId(user.id);
    if (!availableKeys || availableKeys.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No LLM provider key configured. Add one on /settings.',
          code: 'no-api-key',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { message, sessionId, files, action, deploymentId } = body;

    if (action === 'confirm_deploy') {
      return handleConfirmAndDeploy(body, user);
    }

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let session;
    if (sessionId) {
      session = await BuilderSessionRepository.findByIdAndUserId(sessionId, user.id);
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      const preloadedContext = await buildPreloadedContext(user.id);

      let existingConfig = null;
      if (deploymentId) {
        const deployment = await DeploymentRepository.findById(deploymentId);
        if (deployment) {
          existingConfig = parseModularDeploymentConfig(deployment.config);
          existingConfig._deployment = {
            id: deployment.id,
            botName: deployment.botName,
          };
        }
      }

      session = await BuilderSessionRepository.createWithContext({
        userId: user.id,
        botSpaceId: null,
        preloadedContext,
        existingConfig,
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          sendEvent(controller, encoder, EventTypes.SESSION, {
            sessionId: session.id,
            status: session.status,
            disableModuloAnimation: false,
          });

          await BuilderSessionRepository.updateStatus(
            session.id,
            user.id,
            SESSION_STATUS.PROCESSING
          );
          sendEvent(controller, encoder, EventTypes.STATUS_CHANGE, {
            status: SESSION_STATUS.PROCESSING,
          });

          let documentContext = null;
          if (files && files.length > 0) {
            documentContext = await processAttachedFiles(
              files,
              user.id,
              session.id,
              controller,
              encoder
            );
          }

          await BuilderSessionRepository.appendMessage(session.id, user.id, {
            role: 'user',
            content: message,
            documentIds: documentContext?.uploadedDocuments?.map((d) => d.id),
          });

          const messages = (session.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
          }));

          let userMessageContent = message;
          if (documentContext?.uploadedDocuments?.length > 0) {
            const attachedDocs = documentContext.uploadedDocuments
              .map((d) => `- ${d.originalName} (${d.id})`)
              .join('\n');
            userMessageContent = `${message}\n\n[Attached documents - process ONLY these, not other workspace documents]\n${attachedDocs}`;
          }
          messages.push({ role: 'user', content: userMessageContent });

          const isFirstMessage = (session.messages || []).length === 0;
          const isEditMode = session.status === SESSION_STATUS.EDITING;

          let systemPrompt;
          if (isEditMode && isFirstMessage) {
            systemPrompt = buildBuilderEditPrompt(session.preloadedContext, {
              core: session.generatedConfigs?.core,
              identity: session.generatedConfigs?.identity,
              enabledProtocols: session.enabledProtocols,
              protocolData: session.protocolData,
              _editingDeployment: session.generatedConfigs?._editingDeployment,
            });
          } else if (isFirstMessage) {
            systemPrompt = buildBuilderSystemPrompt(session.preloadedContext);
          } else {
            systemPrompt = buildBuilderContinuationPrompt({
              status: session.status,
              inferredIntent: session.inferredIntent,
              recommendedProtocols: session.recommendedProtocols,
            });
          }

          const executionContext = {
            session,
            userId: user.id,
            botSpaceId: null,
            documentContext,
          };

          const llmConfig = await getLLMConfigForBuilder(session, user.id);

          const { fullResponse, toolResults } = await streamModularWithTools(
            systemPrompt,
            messages,
            executionContext,
            controller,
            encoder,
            llmConfig
          );

          await BuilderSessionRepository.appendMessage(session.id, user.id, {
            role: 'assistant',
            content: fullResponse,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
          });

          const hasRecommendations = toolResults.some(
            (t) => t.tool === 'compose_identity' && t.success
          );
          if (hasRecommendations) {
            await BuilderSessionRepository.updateStatus(
              session.id,
              user.id,
              SESSION_STATUS.AWAITING_CONFIRM
            );
            sendEvent(controller, encoder, EventTypes.AWAITING_CONFIRMATION, {
              sessionId: session.id,
            });
          }

          const finalSession = await BuilderSessionRepository.findById(session.id);

          sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'idle' });

          sendEvent(controller, encoder, EventTypes.DONE, {
            sessionId: session.id,
            status: finalSession.status,
            inferredIntent: finalSession.inferredIntent,
            recommendedProtocols: finalSession.recommendedProtocols,
            generatedConfigs: finalSession.generatedConfigs,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
          });

          await auditLog({
            eventType: 'builder.stream',
            actor: { id: user.id, email: user.email },
            resource: { type: 'modular_session', id: session.id },
            action: 'process',
            outcome: 'success',
            metadata: {
              toolsUsed: toolResults.map((t) => t.tool),
              status: finalSession.status,
            },
          });

          controller.close();
        } catch (error) {
          console.error('[Builder Stream] Error:', error);
          sendEvent(controller, encoder, EventTypes.ERROR, { error: error.message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Builder Stream] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleConfirmAndDeploy(body, user) {
  const { sessionId, confirmedProtocols } = body;
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Session ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await BuilderSessionRepository.findByIdAndUserId(sessionId, user.id);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        sendEvent(controller, encoder, EventTypes.DEPLOYMENT_STARTED, { sessionId });

        const executionContext = { session, userId: user.id };
        const result = await executeBuilderTool(
          'save_modular_bot',
          {
            sessionId,
            confirmedProtocols: confirmedProtocols || session.recommendedProtocols,
          },
          executionContext
        );

        if (result.success) {
          sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, {
            state: 'celebrating',
          });
          sendEvent(controller, encoder, EventTypes.DEPLOYMENT_COMPLETE, {
            deploymentId: result.result.deploymentId,
            botName: result.result.botName,
            status: result.result.status,
          });
        } else {
          sendEvent(controller, encoder, EventTypes.DEPLOYMENT_FAILED, { error: result.error });
        }

        sendEvent(controller, encoder, EventTypes.DONE, {
          sessionId,
          success: result.success,
          result: result.result,
          error: result.error,
        });
        controller.close();
      } catch (error) {
        console.error('[Builder Deploy] Error:', error);
        sendEvent(controller, encoder, EventTypes.ERROR, { error: error.message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function processAttachedFiles(files, _userId, _sessionId, controller, encoder) {
  if (!files || files.length === 0) return null;

  const parsedDocuments = [];
  const uploadedDocuments = [];

  const mimeTypes = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    sendEvent(controller, encoder, EventTypes.DOCUMENT_PROCESSING, {
      current: i + 1,
      total: files.length,
      fileName: file.name,
    });

    try {
      const buffer = Buffer.from(file.base64, 'base64');
      const content = await parseDocument(buffer, file.name);
      parsedDocuments.push({ name: file.name, content });

      const ext = file.name.split('.').pop()?.toLowerCase();
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const storagePath = `documents/${Date.now()}-${file.name}`;
      await uploadFile(storagePath, buffer, null, { contentType: mimeType });

      const document = await DocumentRepository.create({
        storagePath,
        originalName: file.name,
        mimeType,
        sizeBytes: buffer.length,
        parsedText: content,
      });

      uploadedDocuments.push({
        id: document.id,
        name: file.name,
        originalName: file.name,
      });

      sendEvent(controller, encoder, EventTypes.DOCUMENT_UPLOADED, {
        fileName: file.name,
        documentId: document.id,
      });
    } catch (err) {
      console.error(`[Builder] Failed to parse ${file.name}:`, err.message);
      sendEvent(controller, encoder, EventTypes.DOCUMENT_ERROR, {
        fileName: file.name,
        error: err.message,
      });
      parsedDocuments.push({ name: file.name, error: err.message });
    }
  }

  return { parsedDocuments, uploadedDocuments };
}

async function streamModularWithTools(
  systemPrompt,
  messages,
  executionContext,
  controller,
  encoder,
  llmConfig
) {
  const { provider, apiKey, model } = llmConfig;

  if (provider === 'bedrock') {
    return streamModularWithBedrockTools(
      systemPrompt,
      messages,
      executionContext,
      controller,
      encoder,
      llmConfig
    );
  }

  if (provider === 'openai') {
    return streamModularWithOpenAITools(
      systemPrompt,
      messages,
      executionContext,
      controller,
      encoder,
      llmConfig
    );
  }

  if (provider === 'ollama') {
    return streamModularWithOllamaTools(
      systemPrompt,
      messages,
      executionContext,
      controller,
      encoder,
      llmConfig
    );
  }

  if (provider !== 'anthropic') {
    throw new Error(
      `Lite chat builder streaming supports Anthropic, OpenAI, Ollama, or Bedrock. Got: ${provider}.`
    );
  }

  const toolResults = [];
  let currentMessages = [...messages];
  let iterations = 0;
  let fullResponse = '';

  const cachedTools = BUILDER_TOOLS.map((tool, index) => {
    if (index === BUILDER_TOOLS.length - 1) {
      return { ...tool, cache_control: { type: 'ephemeral' } };
    }
    return tool;
  });

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    if (iterations > 1) {
      await new Promise((r) => setTimeout(r, TOOL_LOOP_DELAY_MS));
    }

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: model || CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: currentMessages,
        tools: cachedTools,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Claude API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentText = '';
    let toolUseBlocks = [];
    let currentToolUse = null;
    let sentSpeakingState = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: '',
              };
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              if (!sentSpeakingState) {
                sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, {
                  state: 'speaking',
                });
                sentSpeakingState = true;
              }
              currentText += event.delta.text;
              sendEvent(controller, encoder, EventTypes.TEXT, { text: event.delta.text });
            } else if (event.delta?.type === 'input_json_delta' && currentToolUse) {
              currentToolUse.input += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              try {
                currentToolUse.input = JSON.parse(currentToolUse.input || '{}');
              } catch {
                currentToolUse.input = {};
              }
              toolUseBlocks.push(currentToolUse);
              currentToolUse = null;
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    fullResponse += currentText;

    if (toolUseBlocks.length === 0) {
      return { fullResponse, toolResults };
    }

    const toolResultContents = [];
    for (const toolUse of toolUseBlocks) {
      sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'thinking' });
      sendEvent(controller, encoder, EventTypes.TOOL_STARTED, {
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        input: toolUse.input,
      });

      const updatedSession = await BuilderSessionRepository.findById(
        executionContext.session.id
      );
      executionContext.session = updatedSession;

      const result = await executeBuilderTool(
        toolUse.name,
        toolUse.input,
        executionContext
      );

      toolResults.push({
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        success: result.success,
        result: result.success ? result.result : undefined,
        error: result.error,
      });

      if (result.success) {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'success' });
        sendEvent(controller, encoder, EventTypes.TOOL_COMPLETED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          result: result.result,
        });

        if (toolUse.name === 'infer_intent') {
          sendEvent(controller, encoder, EventTypes.INFERENCE_COMPLETE, {
            intent: result.result.intent,
            confidence: result.result.confidence,
          });
        } else if (toolUse.name === 'recommend_protocols') {
          sendEvent(controller, encoder, EventTypes.PROTOCOLS_RECOMMENDED, {
            protocols: result.result.protocols,
          });
        } else if (toolUse.name === 'compose_identity') {
          sendEvent(controller, encoder, EventTypes.IDENTITY_COMPOSED, {
            identity: result.result.identity,
          });
        } else if (toolUse.name === 'set_suggested_prompts') {
          sendEvent(controller, encoder, EventTypes.PROMPTS_SET, {
            identity: result.result.identity,
          });
        } else if (toolUse.name === 'generate_bot_summary') {
          sendEvent(controller, encoder, EventTypes.BOT_SUMMARY_GENERATED, {
            botSummary: result.result.botSummary,
          });
        }
      } else {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'concerned' });
        sendEvent(controller, encoder, EventTypes.TOOL_FAILED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          error: result.error,
        });
      }

      toolResultContents.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.success
          ? JSON.stringify(result.result, null, 2)
          : `Error: ${result.error}`,
        is_error: !result.success,
      });
    }

    currentMessages.push({
      role: 'assistant',
      content: [
        ...(currentText ? [{ type: 'text', text: currentText }] : []),
        ...toolUseBlocks.map((tu) => ({
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input: tu.input,
        })),
      ],
    });

    currentMessages.push({ role: 'user', content: toolResultContents });

    toolUseBlocks = [];
    currentText = '';
  }

  return { fullResponse, toolResults };
}

async function streamModularWithBedrockTools(
  systemPrompt,
  messages,
  executionContext,
  controller,
  encoder,
  llmConfig
) {
  const { BedrockRuntimeClient, ConverseStreamCommand } = await import(
    '@aws-sdk/client-bedrock-runtime'
  );

  let credentials;
  try {
    credentials = JSON.parse(llmConfig.apiKey);
  } catch {
    throw new Error('Invalid Bedrock credentials format');
  }

  const { region, useIamRole, accessKeyId, secretAccessKey } = credentials;
  const clientConfig = { region: region || 'us-east-1' };
  if (!useIamRole && accessKeyId && secretAccessKey) {
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  }
  const client = new BedrockRuntimeClient(clientConfig);
  const modelId = buildBedrockModelId(llmConfig.model, region);

  const bedrockTools = BUILDER_TOOLS.map((tool) => ({
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: { json: tool.input_schema },
    },
  }));

  const convertMessagesToBedrock = (msgs) =>
    msgs.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: [{ text: msg.content }] };
      }
      const bedrockContent = msg.content.map((block) => {
        if (block.type === 'text') return { text: block.text };
        if (block.type === 'tool_use') {
          return {
            toolUse: {
              toolUseId: block.id,
              name: block.name,
              input: block.input,
            },
          };
        }
        if (block.type === 'tool_result') {
          return {
            toolResult: {
              toolUseId: block.tool_use_id,
              content: [{ text: block.content }],
              status: block.is_error ? 'error' : 'success',
            },
          };
        }
        return { text: JSON.stringify(block) };
      });
      return { role: msg.role, content: bedrockContent };
    });

  const toolResults = [];
  let currentMessages = [...messages];
  let iterations = 0;
  let fullResponse = '';

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    if (iterations > 1) {
      await new Promise((r) => setTimeout(r, TOOL_LOOP_DELAY_MS));
    }

    const bedrockMessages = convertMessagesToBedrock(currentMessages);
    const command = new ConverseStreamCommand({
      modelId,
      system: [{ text: systemPrompt }],
      messages: bedrockMessages,
      toolConfig: { tools: bedrockTools },
      inferenceConfig: { maxTokens: MAX_TOKENS },
    });

    const response = await client.send(command);

    let currentText = '';
    let toolUseBlocks = [];
    let currentToolUse = null;
    let sentSpeakingState = false;

    for await (const event of response.stream) {
      if (event.contentBlockStart) {
        const block = event.contentBlockStart.start;
        if (block?.toolUse) {
          currentToolUse = {
            id: block.toolUse.toolUseId,
            name: block.toolUse.name,
            input: '',
          };
        }
      } else if (event.contentBlockDelta) {
        const delta = event.contentBlockDelta.delta;
        if (delta?.text) {
          if (!sentSpeakingState) {
            sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'speaking' });
            sentSpeakingState = true;
          }
          currentText += delta.text;
          sendEvent(controller, encoder, EventTypes.TEXT, { text: delta.text });
        } else if (delta?.toolUse && currentToolUse) {
          currentToolUse.input += delta.toolUse.input || '';
        }
      } else if (event.contentBlockStop) {
        if (currentToolUse) {
          try {
            currentToolUse.input = JSON.parse(currentToolUse.input || '{}');
          } catch {
            currentToolUse.input = {};
          }
          toolUseBlocks.push(currentToolUse);
          currentToolUse = null;
        }
      }
    }

    fullResponse += currentText;

    if (toolUseBlocks.length === 0) {
      return { fullResponse, toolResults };
    }

    const toolResultContents = [];
    for (const toolUse of toolUseBlocks) {
      sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'thinking' });
      sendEvent(controller, encoder, EventTypes.TOOL_STARTED, {
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        input: toolUse.input,
      });

      const updatedSession = await BuilderSessionRepository.findById(
        executionContext.session.id
      );
      executionContext.session = updatedSession;

      const result = await executeBuilderTool(toolUse.name, toolUse.input, executionContext);
      toolResults.push({
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        success: result.success,
        result: result.success ? result.result : undefined,
        error: result.error,
      });

      if (result.success) {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'success' });
        sendEvent(controller, encoder, EventTypes.TOOL_COMPLETED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          result: result.result,
        });
      } else {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'concerned' });
        sendEvent(controller, encoder, EventTypes.TOOL_FAILED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          error: result.error,
        });
      }

      toolResultContents.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.success
          ? JSON.stringify(result.result, null, 2)
          : `Error: ${result.error}`,
        is_error: !result.success,
      });
    }

    currentMessages.push({
      role: 'assistant',
      content: [
        ...(currentText ? [{ type: 'text', text: currentText }] : []),
        ...toolUseBlocks.map((tu) => ({
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input: tu.input,
        })),
      ],
    });

    currentMessages.push({ role: 'user', content: toolResultContents });

    toolUseBlocks = [];
  }

  return { fullResponse, toolResults };
}

/**
 * OpenAI orchestrator for the chat builder.
 *
 * Mirrors the Anthropic path: agentic tool-use loop, same SSE event vocabulary,
 * same `currentMessages` shape (Anthropic-flavored — converted at the wire only).
 * Uses OpenAI's Responses API (`/v1/responses`) with `stream: true`. Tool schemas
 * are reused as-is — `BUILDER_TOOLS[].input_schema` is already valid JSON Schema
 * and slots directly into OpenAI's `parameters` field.
 *
 * Prompt caching is automatic on OpenAI for prompts ≥1024 tokens; we keep
 * `instructions` byte-stable across turns to maximize hit rate.
 */
async function streamModularWithOpenAITools(
  systemPrompt,
  messages,
  executionContext,
  controller,
  encoder,
  llmConfig
) {
  const { apiKey, model } = llmConfig;

  const openaiTools = BUILDER_TOOLS.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));

  // Convert the persisted Anthropic-shaped history into OpenAI Responses-API
  // input items. function_call / function_call_output are top-level items
  // (no role); the call_id round-trips Anthropic's tool_use.id.
  const convertMessagesToOpenAI = (msgs) => {
    const input = [];
    for (const msg of msgs) {
      if (typeof msg.content === 'string') {
        input.push({ role: msg.role, content: msg.content });
        continue;
      }
      if (msg.role === 'assistant') {
        const textBlocks = msg.content.filter((b) => b.type === 'text');
        const toolUseBlocks = msg.content.filter((b) => b.type === 'tool_use');
        if (textBlocks.length > 0) {
          input.push({
            role: 'assistant',
            content: textBlocks.map((b) => b.text).join(''),
          });
        }
        for (const tu of toolUseBlocks) {
          input.push({
            type: 'function_call',
            call_id: tu.id,
            name: tu.name,
            arguments: JSON.stringify(tu.input || {}),
          });
        }
      } else if (msg.role === 'user') {
        const toolResults = msg.content.filter((b) => b.type === 'tool_result');
        for (const tr of toolResults) {
          input.push({
            type: 'function_call_output',
            call_id: tr.tool_use_id,
            output: String(tr.content),
          });
        }
        const textBlocks = msg.content.filter((b) => b.type === 'text');
        if (textBlocks.length > 0) {
          input.push({
            role: 'user',
            content: textBlocks.map((b) => b.text).join(''),
          });
        }
      }
    }
    return input;
  };

  const toolResults = [];
  let currentMessages = [...messages];
  let iterations = 0;
  let fullResponse = '';

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    if (iterations > 1) {
      await new Promise((r) => setTimeout(r, TOOL_LOOP_DELAY_MS));
    }

    const openaiInput = convertMessagesToOpenAI(currentMessages);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4.1',
        instructions: systemPrompt,
        input: openaiInput,
        tools: openaiTools,
        tool_choice: 'auto',
        stream: true,
        max_output_tokens: MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentText = '';
    let toolUseBlocks = [];
    // Map: OpenAI item_id → accumulating {id: call_id, name, input}
    const toolUsesByItemId = new Map();
    let sentSpeakingState = false;
    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'response.output_item.added') {
            const item = event.item;
            if (item?.type === 'function_call') {
              toolUsesByItemId.set(item.id, {
                id: item.call_id,
                name: item.name,
                input: '',
              });
            }
          } else if (event.type === 'response.function_call_arguments.delta') {
            const tu = toolUsesByItemId.get(event.item_id);
            if (tu) tu.input += event.delta || '';
          } else if (event.type === 'response.function_call_arguments.done') {
            const tu = toolUsesByItemId.get(event.item_id);
            if (tu) {
              try {
                tu.input = JSON.parse(tu.input || '{}');
              } catch {
                tu.input = {};
              }
              toolUseBlocks.push(tu);
              toolUsesByItemId.delete(event.item_id);
            }
          } else if (event.type === 'response.output_text.delta') {
            if (!sentSpeakingState) {
              sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, {
                state: 'speaking',
              });
              sentSpeakingState = true;
            }
            const delta = event.delta || '';
            currentText += delta;
            sendEvent(controller, encoder, EventTypes.TEXT, { text: delta });
          } else if (event.type === 'response.error' || event.type === 'error') {
            streamError = event.error?.message || event.message || 'OpenAI stream error';
          }
        } catch {
          // ignore JSON parse errors on individual events
        }
      }
    }

    if (streamError) {
      throw new Error(`OpenAI streaming error: ${streamError}`);
    }

    fullResponse += currentText;

    if (toolUseBlocks.length === 0) {
      return { fullResponse, toolResults };
    }

    const toolResultContents = [];
    for (const toolUse of toolUseBlocks) {
      sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'thinking' });
      sendEvent(controller, encoder, EventTypes.TOOL_STARTED, {
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        input: toolUse.input,
      });

      const updatedSession = await BuilderSessionRepository.findById(
        executionContext.session.id
      );
      executionContext.session = updatedSession;

      const result = await executeBuilderTool(toolUse.name, toolUse.input, executionContext);
      toolResults.push({
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        success: result.success,
        result: result.success ? result.result : undefined,
        error: result.error,
      });

      if (result.success) {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'success' });
        sendEvent(controller, encoder, EventTypes.TOOL_COMPLETED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          result: result.result,
        });

        if (toolUse.name === 'infer_intent') {
          sendEvent(controller, encoder, EventTypes.INFERENCE_COMPLETE, {
            intent: result.result.intent,
            confidence: result.result.confidence,
          });
        } else if (toolUse.name === 'recommend_protocols') {
          sendEvent(controller, encoder, EventTypes.PROTOCOLS_RECOMMENDED, {
            protocols: result.result.protocols,
          });
        } else if (toolUse.name === 'compose_identity') {
          sendEvent(controller, encoder, EventTypes.IDENTITY_COMPOSED, {
            identity: result.result.identity,
          });
        } else if (toolUse.name === 'set_suggested_prompts') {
          sendEvent(controller, encoder, EventTypes.PROMPTS_SET, {
            identity: result.result.identity,
          });
        } else if (toolUse.name === 'generate_bot_summary') {
          sendEvent(controller, encoder, EventTypes.BOT_SUMMARY_GENERATED, {
            botSummary: result.result.botSummary,
          });
        }
      } else {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'concerned' });
        sendEvent(controller, encoder, EventTypes.TOOL_FAILED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          error: result.error,
        });
      }

      toolResultContents.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.success
          ? JSON.stringify(result.result, null, 2)
          : `Error: ${result.error}`,
        is_error: !result.success,
      });
    }

    currentMessages.push({
      role: 'assistant',
      content: [
        ...(currentText ? [{ type: 'text', text: currentText }] : []),
        ...toolUseBlocks.map((tu) => ({
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input: tu.input,
        })),
      ],
    });

    currentMessages.push({ role: 'user', content: toolResultContents });

    toolUseBlocks = [];
  }

  return { fullResponse, toolResults };
}

/**
 * Ollama orchestrator for the chat builder.
 *
 * Mirrors the Anthropic and OpenAI paths: agentic tool-use loop, same SSE
 * event vocabulary, same `currentMessages` shape (Anthropic-flavored —
 * converted at the wire only). Uses Ollama's `/api/chat` endpoint with
 * `stream: true`, which returns NDJSON (one JSON object per line) rather
 * than SSE. Tool schemas are reused as-is — `BUILDER_TOOLS[].input_schema`
 * is valid JSON Schema and slots into Ollama's OpenAI-compatible
 * `function.parameters` field.
 *
 * No prompt caching on Ollama — every iteration re-processes the full prompt.
 * Acceptable since local inference has no per-token cost.
 */
async function streamModularWithOllamaTools(
  systemPrompt,
  messages,
  executionContext,
  controller,
  encoder,
  llmConfig
) {
  const { apiKey, model } = llmConfig;
  const host = resolveOllamaHost(apiKey);

  const ollamaTools = BUILDER_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));

  // Chain-continuation directive prepended to the shared system prompt for
  // Ollama only. Anthropic / OpenAI chain tools aggressively in agentic
  // loops because of how they're trained; open models (llama3.3, mistral-nemo)
  // default to conversational behavior and tend to emit prose after each tool
  // — which exits the orchestrator at the zero-tool-call branch below before
  // infer_intent / recommend_protocols / compose_identity ever run. This
  // section makes the chain explicit and forbids prose between steps.
  const ollamaSystemPrompt = `# CRITICAL: Tool Chain Execution Rules

You MUST execute the full tool chain in sequence before addressing the user. Do NOT emit any user-facing text between tool calls. The chain is:

1. process_documents (if documents are attached)
2. infer_intent (ALWAYS, even with no documents)
3. recommend_protocols (ALWAYS)
4. Protocol-specific tools as needed: generate_form_schema, generate_appointment_config, generate_triage_config, generate_optical_read_config
5. compose_identity (ALWAYS)
6. set_suggested_prompts AND generate_bot_summary (BOTH, after compose_identity)

After process_documents returns, immediately call infer_intent on the next turn — do not write a message to the user. After infer_intent, immediately call recommend_protocols. Continue without prose until compose_identity completes.

Only after set_suggested_prompts and generate_bot_summary have both succeeded should you write your first user-facing message presenting the recommendations and asking for confirmation. Do not call save_modular_bot until the user explicitly confirms.

If you find yourself wanting to write "I've processed your documents" or "Let me know what's next" between tool calls — DO NOT. Call the next tool instead. The user sees each tool call as a pill in the chat log, so they know what's happening.

---

${systemPrompt}`;

  // Convert the persisted Anthropic-shaped history into Ollama's chat-message
  // shape. Tool calls live on the assistant message as `tool_calls`; tool
  // results are their own `role: 'tool'` messages keyed by `tool_call_id`
  // (round-tripping Anthropic's tool_use.id).
  const convertMessagesToOllama = (msgs) => {
    const out = [];
    for (const msg of msgs) {
      if (typeof msg.content === 'string') {
        out.push({ role: msg.role, content: msg.content });
        continue;
      }
      if (msg.role === 'assistant') {
        const textBlocks = msg.content.filter((b) => b.type === 'text');
        const toolUseBlocks = msg.content.filter((b) => b.type === 'tool_use');
        const assistantMsg = {
          role: 'assistant',
          content: textBlocks.map((b) => b.text).join(''),
        };
        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map((tu) => ({
            id: tu.id,
            function: {
              name: tu.name,
              arguments: tu.input || {},
            },
          }));
        }
        out.push(assistantMsg);
      } else if (msg.role === 'user') {
        const toolResultBlocks = msg.content.filter((b) => b.type === 'tool_result');
        for (const tr of toolResultBlocks) {
          out.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: String(tr.content),
          });
        }
        const textBlocks = msg.content.filter((b) => b.type === 'text');
        if (textBlocks.length > 0) {
          out.push({
            role: 'user',
            content: textBlocks.map((b) => b.text).join(''),
          });
        }
      }
    }
    return out;
  };

  const toolResults = [];
  let currentMessages = [...messages];
  let iterations = 0;
  let fullResponse = '';

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const ollamaMessages = [
      { role: 'system', content: ollamaSystemPrompt },
      ...convertMessagesToOllama(currentMessages),
    ];

    const response = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3.3',
        messages: ollamaMessages,
        tools: ollamaTools,
        stream: true,
        // Suppress hybrid-reasoning scratchpad if the user overrode to qwen3.
        // No-op on llama3.3 / mistral-nemo.
        think: false,
        // Pin the model in memory across iterations and across user turns in
        // the same builder session. Default unload (~5 min) makes a 70B
        // llama3.3 cold-reload between messages, which is a 30–60s stall on
        // typical hardware. 30m comfortably spans an interactive build.
        keep_alive: '30m',
        options: {
          // Tool-use loop accumulates tool_results across iterations (full
          // JSON dumps of identity / protocols / form schemas); the default
          // 2048 window overflows fast on multi-step builder runs. 32K is
          // headroom for llama3.3's 128K native context without ballooning
          // KV cache on smaller hosts.
          num_ctx: 32768,
          // Ollama defaults to 0.8 which is too loose for tool-call argument
          // selection — at 70B the model becomes more confident about
          // plausible-but-wrong tool args. 0.2 keeps it deterministic on the
          // tool channel without making the short prose deltas robotic.
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Ollama API error (${response.status}): ${errorText || response.statusText}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentText = '';
    const accumulatedToolCalls = [];
    let sentSpeakingState = false;

    // Ollama streams NDJSON — one JSON object per line, terminated by a chunk
    // with `done: true`. Text deltas arrive in `message.content`; tool_calls
    // usually arrive whole in a single chunk (often the done chunk) rather
    // than incrementally, so we accumulate per-chunk and dispatch after the
    // stream closes.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (event.error) {
          throw new Error(`Ollama streaming error: ${event.error}`);
        }
        const delta = event.message?.content || '';
        if (delta) {
          if (!sentSpeakingState) {
            sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, {
              state: 'speaking',
            });
            sentSpeakingState = true;
          }
          currentText += delta;
          sendEvent(controller, encoder, EventTypes.TEXT, { text: delta });
        }
        const calls = event.message?.tool_calls;
        if (Array.isArray(calls) && calls.length > 0) {
          accumulatedToolCalls.push(...calls);
        }
      }
    }

    // Defense in depth — llama3.3 / mistral-nemo don't emit <think>, but a
    // user-overridden qwen3 might leak the scratchpad despite `think: false`.
    currentText = currentText
      .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
      .replace(/<think\b[^>]*>[\s\S]*$/i, '');

    fullResponse += currentText;

    // Normalize Ollama tool_calls into the orchestrator's shared shape.
    // `arguments` can be either a string (JSON-encoded) or an object
    // depending on model — handle both.
    const toolUseBlocks = accumulatedToolCalls.map((tc, idx) => {
      let input = tc.function?.arguments;
      if (typeof input === 'string') {
        try {
          input = JSON.parse(input || '{}');
        } catch {
          input = {};
        }
      } else if (!input || typeof input !== 'object') {
        input = {};
      }
      return {
        id: tc.id || `ollama_tool_${iterations}_${idx}`,
        name: tc.function?.name,
        input,
      };
    });

    if (toolUseBlocks.length === 0) {
      return { fullResponse, toolResults };
    }

    const toolResultContents = [];
    for (const toolUse of toolUseBlocks) {
      sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'thinking' });
      sendEvent(controller, encoder, EventTypes.TOOL_STARTED, {
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        input: toolUse.input,
      });

      const updatedSession = await BuilderSessionRepository.findById(
        executionContext.session.id
      );
      executionContext.session = updatedSession;

      const result = await executeBuilderTool(toolUse.name, toolUse.input, executionContext);
      toolResults.push({
        tool: toolUse.name,
        toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
        success: result.success,
        result: result.success ? result.result : undefined,
        error: result.error,
      });

      if (result.success) {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'success' });
        sendEvent(controller, encoder, EventTypes.TOOL_COMPLETED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          result: result.result,
        });

        if (toolUse.name === 'infer_intent') {
          sendEvent(controller, encoder, EventTypes.INFERENCE_COMPLETE, {
            intent: result.result.intent,
            confidence: result.result.confidence,
          });
        } else if (toolUse.name === 'recommend_protocols') {
          sendEvent(controller, encoder, EventTypes.PROTOCOLS_RECOMMENDED, {
            protocols: result.result.protocols,
          });
        } else if (toolUse.name === 'compose_identity') {
          sendEvent(controller, encoder, EventTypes.IDENTITY_COMPOSED, {
            identity: result.result.identity,
          });
        } else if (toolUse.name === 'set_suggested_prompts') {
          sendEvent(controller, encoder, EventTypes.PROMPTS_SET, {
            identity: result.result.identity,
          });
        } else if (toolUse.name === 'generate_bot_summary') {
          sendEvent(controller, encoder, EventTypes.BOT_SUMMARY_GENERATED, {
            botSummary: result.result.botSummary,
          });
        }
      } else {
        sendEvent(controller, encoder, EventTypes.MODULO_EXPRESSION, { state: 'concerned' });
        sendEvent(controller, encoder, EventTypes.TOOL_FAILED, {
          tool: toolUse.name,
          toolDisplayName: TOOL_LABELS[toolUse.name] || toolUse.name,
          error: result.error,
        });
      }

      toolResultContents.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.success
          ? JSON.stringify(result.result, null, 2)
          : `Error: ${result.error}`,
        is_error: !result.success,
      });
    }

    currentMessages.push({
      role: 'assistant',
      content: [
        ...(currentText ? [{ type: 'text', text: currentText }] : []),
        ...toolUseBlocks.map((tu) => ({
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input: tu.input,
        })),
      ],
    });

    currentMessages.push({ role: 'user', content: toolResultContents });
  }

  return { fullResponse, toolResults };
}
