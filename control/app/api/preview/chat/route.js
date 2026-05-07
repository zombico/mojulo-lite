/**
 * Wizard preview chat. Runs the same prompt assembly the bot container runs,
 * but in-process — no Docker build, no SQLite, no persisted state. The wizard
 * sends the in-progress config + history each turn; we compose instructions,
 * hydrate an in-memory VectorRAG from the pre-baked embeddings blob, and call
 * the shared assemblePrompt helper that the bot container also uses.
 *
 * Contract:
 *   POST { prompt, conversationHistory?, enabledProtocols?, protocolData?,
 *          objective?, llm, turn?, embeddingsStorageKey? }
 *   →    { response: <satiJson>, trace, sources }
 */

import { NextResponse } from 'next/server';
import path from 'path';
import { pathToFileURL } from 'url';
import { composeInstructions } from '@/lib/composer/composer';
import { downloadToBuffer } from '@/lib/storage';
import VectorRAGPreview from '@/lib/embedder/preview-rag';
import {
  resolveSavedApiKeyIntoConfig,
  preserveExistingCredentials,
} from '@/lib/resolve-api-key';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';

// The bot container's runtime helpers live outside this Next project. Turbopack
// statically follows both `import` and `require()`, even when the path is
// constructed at runtime — so we hide the dynamic import behind `new Function`,
// which the bundler cannot analyse.
const dynImport = new Function('specifier', 'return import(specifier)');

let liteHelpers = null;
async function loadLiteHelpers() {
  if (liteHelpers) return liteHelpers;
  const litePath =
    process.env.LITE_TEMPLATE_PATH ||
    path.resolve(process.cwd(), '..', 'lite-template');
  const toUrl = (rel) => pathToFileURL(path.join(litePath, 'helper', rel)).href;
  const [llm, asm, je] = await Promise.all([
    dynImport(toUrl('llm-client.js')),
    dynImport(toUrl('prompt-assembler.js')),
    dynImport(toUrl('json-extractor.js')),
  ]);
  liteHelpers = {
    createLLMClient: llm.createLLMClient ?? llm.default?.createLLMClient,
    assemblePrompt: asm.assemblePrompt ?? asm.default?.assemblePrompt,
    extractJSON: je.extractJSON ?? je.default?.extractJSON,
  };
  return liteHelpers;
}

function fallbackResponse(rawText, turn) {
  return {
    answer: rawText || 'I apologize, but I encountered an error processing my response.',
    formTracker: {},
    suggestions: [],
    formSuggestions: [],
    fieldsRemaining: 0,
    isComplete: false,
    turn: (turn || 0) + 1,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      prompt,
      conversationHistory = [],
      enabledProtocols = {},
      protocolData = {},
      objective,
      llm,
      apiKeyId = null,
      editDeploymentId = null,
      turn = 0,
      embeddingsStorageKey = null,
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }
    if (!llm || !llm.provider) {
      return NextResponse.json({ error: 'llm.provider is required' }, { status: 400 });
    }

    // Saved-key path: the wizard sent only an opaque apiKeyId; decrypt the
    // matching api_keys row and patch credentials into the llm block so the
    // browser never had to handle plaintext. Same helper the deploy path uses.
    //
    // Edit-mode reuse path: the user is editing an existing bot, hasn't
    // pasted a new credential, and hasn't picked a saved key — but the
    // deployment row already holds plaintext (it's what the artifact's .env
    // gets). Look that up server-side so the preview can boot. Wizard never
    // sees the plaintext.
    let resolvedLlm = llm;
    if (apiKeyId) {
      const wrapped = await resolveSavedApiKeyIntoConfig({ llm }, apiKeyId);
      resolvedLlm = wrapped.llm;
    } else if (editDeploymentId) {
      const existing = await DeploymentRepository.findById(editDeploymentId);
      if (existing?.config) {
        const wrapped = preserveExistingCredentials({ llm: { ...llm } }, existing.config);
        resolvedLlm = wrapped.llm;
      }
    }

    const { createLLMClient, assemblePrompt, extractJSON } = await loadLiteHelpers();

    const instructions = await composeInstructions({
      objective: objective || 'Help users.',
      enabledProtocols,
      protocolData,
    });

    let ragInstance = null;
    if (embeddingsStorageKey) {
      // Hydrate the same payload the deployed bot reads from
      // config/embeddings.json. Query embedding runs locally via
      // lib/embedder/local.js — same model, same prefix convention as
      // the artifact's helper/embedder-local.js, so the wizard's
      // "test the bot" button exercises the real vector path.
      try {
        const buffer = await downloadToBuffer(embeddingsStorageKey);
        const payload = JSON.parse(buffer.toString('utf8'));
        ragInstance = new VectorRAGPreview(payload);
      } catch (err) {
        console.error(
          `[preview/chat] vector hydrate failed for ${embeddingsStorageKey}:`,
          err.message
        );
      }
    }

    const llmClient = createLLMClient({ llm: resolvedLlm });

    const { result, ragSources } = await assemblePrompt({
      userPrompt: prompt,
      instructions,
      ragInstance,
      llmClient,
      conversationHistory,
    });

    let satiJson;
    try {
      satiJson = extractJSON(result.response);
      satiJson.turn = (turn || 0) + 1;
    } catch (e) {
      console.error('[preview/chat] JSON extraction failed:', e.message);
      satiJson = fallbackResponse(result.response, turn);
    }

    return NextResponse.json({
      response: satiJson,
      trace: result.trace || {},
      sources: ragSources,
    });
  } catch (err) {
    console.error('[preview/chat]', err);
    return NextResponse.json(
      { error: err.message || 'Preview chat failed' },
      { status: 500 }
    );
  }
}
