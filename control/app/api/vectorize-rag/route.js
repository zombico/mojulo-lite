/**
 * POST /api/vectorize-rag
 *
 * Wizard-side embedding generation. Mirrors the chat builder's vector flow
 * in lib/builder/tool-executors.js but is keyed by an opaque session token
 * (botName + timestamp) instead of a builder session id. Persists a single
 * JSON blob at storage path
 *
 *   embeddings/wizard-{token}.json
 *
 * which the wizard stashes on formData and forwards to /api/deployments at
 * save time. The deployment row's embedding_storage_key takes ownership from
 * there; the build pipeline later copies the same blob into the artifact.
 *
 * Accepts both knowledge documents and triage routes — chunks from both end
 * up in the same cosine index, with metadata.source distinguishing them at
 * retrieval time. Re-running with the same wizardToken replaces the blob.
 *
 * Body: { documents?: [{ id, storagePath, originalName }],
 *         routes?: [{ deploymentId, name, description }],
 *         wizardToken? }
 * Returns: { storageKey, model, chunkCount, summary }
 */

import { NextResponse } from 'next/server';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import { downloadToBuffer, uploadFile, deleteFile } from '@/lib/storage';
import { parseDocument } from '@/lib/document-parser';
import { chunkDocuments, chunkTriageRoutes } from '@/lib/embedder/chunker';
import { generateEmbeddings, LOCAL_EMBEDDING_MODEL } from '@/lib/embedder/local';
import { checkRateLimit, RateLimitPresets } from '@/lib/rate-limiter';
import { randomUUID } from 'crypto';

export async function POST(request) {
  const rateLimit = checkRateLimit(request, {
    ...RateLimitPresets.expensive,
    keyPrefix: 'vectorize-rag',
  });
  if (!rateLimit.allowed) return rateLimit.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { documents = [], routes = [], wizardToken: existingToken } = body || {};
  const hasDocs = Array.isArray(documents) && documents.length > 0;
  const hasRoutes = Array.isArray(routes) && routes.length > 0;
  if (!hasDocs && !hasRoutes) {
    return NextResponse.json(
      { error: 'Provide at least one of: documents, routes' },
      { status: 400 }
    );
  }

  // Hydrate parsed text. Wizard sends storagePath + originalName from
  // formData.documents; if it includes ids, prefer the DB row's parsed_text
  // to avoid re-parsing.
  const parsed = [];
  if (hasDocs) {
    for (const doc of documents) {
      try {
        let text = null;
        if (doc.id) {
          const dbDocs = await DocumentRepository.findByIds([doc.id]);
          if (dbDocs.length > 0 && dbDocs[0].parsedText) {
            text = dbDocs[0].parsedText;
          }
        }
        if (!text) {
          const storagePath = doc.storagePath || doc.storage_path;
          const originalName = doc.originalName || doc.file_name;
          if (!storagePath || !originalName) continue;
          const buffer = await downloadToBuffer(storagePath);
          text = await parseDocument(buffer, originalName);
        }
        if (text && text.trim().length > 0) {
          parsed.push({
            id: doc.id || doc.storagePath || doc.storage_path,
            originalName: doc.originalName || doc.file_name,
            text,
          });
        }
      } catch (err) {
        console.error('[vectorize-rag] parse failed:', err.message);
      }
    }
  }

  const chunks = [
    ...(parsed.length > 0 ? chunkDocuments(parsed) : []),
    ...(hasRoutes ? chunkTriageRoutes(routes) : []),
  ];

  if (chunks.length === 0) {
    return NextResponse.json(
      { error: 'No chunks produced from documents or routes' },
      { status: 400 }
    );
  }

  // Stable token for the wizard session — passed back so re-runs overwrite
  // the same blob. Falls back to a fresh token on first invocation.
  const wizardToken = existingToken || `wiz-${randomUUID()}`;
  const storageKey = `embeddings/wizard-${wizardToken}.json`;

  let embeddings;
  try {
    embeddings = await generateEmbeddings(
      chunks.map((c) => c.text),
      { inputType: 'search_document' }
    );
  } catch (err) {
    await deleteFile(storageKey).catch(() => {});
    console.error('[vectorize-rag] local embed failed:', err);
    return NextResponse.json(
      { error: `Embedding failed: ${err.message}` },
      { status: 502 }
    );
  }

  if (embeddings.length !== chunks.length) {
    await deleteFile(storageKey).catch(() => {});
    return NextResponse.json(
      {
        error: `Embedder returned ${embeddings.length} vectors for ${chunks.length} chunks`,
      },
      { status: 502 }
    );
  }

  const payload = {
    model: LOCAL_EMBEDDING_MODEL,
    chunkCount: chunks.length,
    createdAt: new Date().toISOString(),
    chunks: chunks.map((c, i) => ({
      text: c.text,
      embedding: embeddings[i],
      metadata: c.metadata,
    })),
  };

  await uploadFile(storageKey, Buffer.from(JSON.stringify(payload), 'utf8'));

  return NextResponse.json({
    storageKey,
    wizardToken,
    model: LOCAL_EMBEDDING_MODEL,
    chunkCount: chunks.length,
    summary: {
      totalChunks: chunks.length,
      totalDocuments: parsed.length,
      totalRoutes: hasRoutes ? routes.length : 0,
      sourceDocuments: parsed.map((p) => p.originalName),
    },
  });
}
