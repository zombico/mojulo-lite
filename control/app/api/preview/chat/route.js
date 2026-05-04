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
      turn = 0,
      embeddingsStorageKey = null,
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }
    if (!llm || !llm.provider) {
      return NextResponse.json({ error: 'llm.provider is required' }, { status: 400 });
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

    const llmClient = createLLMClient({ llm });

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
