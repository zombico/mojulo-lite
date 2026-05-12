/**
 * Wizard preview optical-read extraction. The deployed bot has /api/extract;
 * this is the in-process equivalent the preview iframe hits via the shim.
 * Real LLM call (per the protocol's resolved design — preview burns tokens
 * by design so the wizard exercises the real vision path), but with no
 * SQLite, no hash chain, and no persisted turn.
 *
 * Contract:
 *   POST { prompt, opticalReadFields, llm, mime, base64,
 *          enabledProtocols?, protocolData?, objective?,
 *          conversationHistory?, apiKeyId?, editDeploymentId? }
 *   →    { answer, extraction: { fields, confidence, notes, showUploadButton },
 *          conversationId: 'preview', chainHash: 'preview', trace }
 */

import { NextResponse } from 'next/server';
import path from 'path';
import { pathToFileURL } from 'url';
import { composeInstructions } from '@/lib/composer/composer';
import {
  resolveSavedApiKeyIntoConfig,
  preserveExistingCredentials,
} from '@/lib/resolve-api-key';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { providerSupportsVision } from '@/lib/llm-providers';

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Hide dynamic import behind new Function so Turbopack doesn't try to follow
// the path into lite-template (mirrors the pattern in /api/preview/chat).
const dynImport = new Function('specifier', 'return import(specifier)');

let liteHelpers = null;
async function loadLiteHelpers() {
  if (liteHelpers) return liteHelpers;
  const litePath =
    process.env.LITE_TEMPLATE_PATH ||
    path.resolve(process.cwd(), '..', 'lite-template');
  const toUrl = (rel) =>
    pathToFileURL(path.join(litePath, 'helper', rel)).href;
  const [llm, je] = await Promise.all([
    dynImport(toUrl('llm-client.js')),
    dynImport(toUrl('json-extractor.js')),
  ]);
  liteHelpers = {
    createLLMClient: llm.createLLMClient ?? llm.default?.createLLMClient,
    extractJSON: je.extractJSON ?? je.default?.extractJSON,
  };
  return liteHelpers;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      opticalReadFields = [],
      conversationHistory = [],
      enabledProtocols = {},
      protocolData = {},
      objective,
      llm,
      apiKeyId = null,
      editDeploymentId = null,
      mime,
      base64,
      fileName,
    } = body;

    if (!Array.isArray(opticalReadFields) || opticalReadFields.length === 0) {
      return NextResponse.json(
        { error: 'opticalReadFields is required' },
        { status: 400 }
      );
    }
    if (!llm || !llm.provider) {
      return NextResponse.json(
        { error: 'llm.provider is required' },
        { status: 400 }
      );
    }
    if (!providerSupportsVision(llm.provider)) {
      return NextResponse.json(
        { error: 'Optical Read requires a vision-capable provider' },
        { status: 400 }
      );
    }
    if (!mime || !ALLOWED_IMAGE_MIMES.has(mime)) {
      return NextResponse.json(
        { error: 'Unsupported image type. Use PNG, JPEG, or WebP.' },
        { status: 400 }
      );
    }
    if (typeof base64 !== 'string' || base64.length === 0) {
      return NextResponse.json(
        { error: 'base64 image data is required' },
        { status: 400 }
      );
    }

    const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(cleaned, 'base64');
    } catch {
      return NextResponse.json({ error: 'Invalid base64 payload' }, { status: 400 });
    }
    if (imageBuffer.length === 0) {
      return NextResponse.json({ error: 'Empty image payload' }, { status: 400 });
    }
    if (imageBuffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: `Image exceeds ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB cap`,
        },
        { status: 413 }
      );
    }

    // Resolve credentials the same way /api/preview/chat does — saved-key
    // reference, edit-mode passthrough, or pasted plaintext.
    let resolvedLlm = llm;
    if (apiKeyId) {
      const wrapped = await resolveSavedApiKeyIntoConfig({ llm }, apiKeyId);
      resolvedLlm = wrapped.llm;
    } else if (editDeploymentId) {
      const existing = await DeploymentRepository.findById(editDeploymentId);
      if (existing?.config) {
        const wrapped = preserveExistingCredentials(
          { llm: { ...llm } },
          existing.config
        );
        resolvedLlm = wrapped.llm;
      }
    }

    const { createLLMClient, extractJSON } = await loadLiteHelpers();

    // Optical Read protocol must be in enabledProtocols so the cartridge +
    // EXTRACTION FIELDS section get composed. The wizard's preview shim
    // already passes the rest of the toggles; we ensure opticalRead is on
    // and the field list is the one the user is actively editing.
    const composedProtocols = { ...enabledProtocols, opticalRead: true };
    const composedProtocolData = {
      ...protocolData,
      opticalRead: { fields: opticalReadFields },
    };
    const instructions = await composeInstructions({
      objective: objective || 'Help users.',
      enabledProtocols: composedProtocols,
      protocolData: composedProtocolData,
    });

    const fieldList = JSON.stringify(opticalReadFields, null, 2);
    const userPrompt =
      'Extract the configured fields from this image. ' +
      'Return one entry per idName under extraction.fields, empty string when missing.\n\n' +
      `Field list:\n${fieldList}`;

    const llmClient = createLLMClient({ llm: resolvedLlm });
    const result = await llmClient.generate(
      instructions,
      userPrompt,
      '',
      conversationHistory,
      { base64: cleaned, mime }
    );

    let parsed;
    try {
      parsed = extractJSON(result.response);
    } catch (err) {
      console.error('[preview/extract] JSON extraction failed:', err.message);
      parsed = {
        answer: 'Could not read the image. Please try a clearer upload.',
        extraction: { fields: {}, showUploadButton: true },
      };
    }

    // Read the new nested shape first; fall back to legacy flat fields so any
    // provider that hasn't followed the cartridge's nested instruction still
    // parses cleanly. Mirrors the backward-compat read in the bot's /api/extract.
    const rawFields = parsed.extraction?.fields ?? parsed.extractedFields ?? {};
    const rawConfidence = parsed.extraction?.confidence ?? parsed.extractionConfidence;
    const rawNotes = parsed.extraction?.notes ?? parsed.extractionNotes;
    const rawShowUpload = parsed.extraction?.showUploadButton ?? parsed.showUploadButton;

    // Defense in depth: only retain configured idNames.
    const allowedIds = new Set(opticalReadFields.map((f) => f.idName));
    const cleanedExtracted = {};
    for (const id of allowedIds) {
      const v = rawFields?.[id];
      cleanedExtracted[id] = typeof v === 'string' ? v : '';
    }

    // Confidence signal — narrow to the enum, fall back to 'medium' on
    // anything off-script. Same shape as the bot's /api/extract response.
    const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);
    const confRaw = (rawConfidence || '').toString().trim().toLowerCase();
    const extractionConfidence = ALLOWED_CONFIDENCE.has(confRaw) ? confRaw : 'medium';
    const extractionNotes = typeof rawNotes === 'string' ? rawNotes : '';

    void fileName; // accepted for parity with /api/extract; not persisted in preview

    const showUploadButton = rawShowUpload === true || rawShowUpload === 'true';

    return NextResponse.json({
      answer: typeof parsed.answer === 'string' ? parsed.answer : '',
      extraction: {
        fields: cleanedExtracted,
        confidence: extractionConfidence,
        notes: extractionNotes,
        showUploadButton,
      },
      conversationId: 'preview',
      chainHash: 'preview',
      trace: result.trace || {},
    });
  } catch (err) {
    console.error('[preview/extract]', err);
    return NextResponse.json(
      { error: err.message || 'Preview extract failed' },
      { status: 500 }
    );
  }
}
