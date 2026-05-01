/**
 * GET /api/settings/embeddings-status
 *
 * Reports the embedding provider available to vector RAG. Local ONNX
 * model (`@huggingface/transformers`) is bundled into the control plane,
 * so `hasEmbeddingsProvider` is always true. The wizard still polls this
 * to surface the model name on the keyword/vector toggle card.
 */

import { NextResponse } from 'next/server';
import { LOCAL_EMBEDDING_MODEL } from '@/lib/embedder/local';

export async function GET() {
  return NextResponse.json({
    hasEmbeddingsProvider: true,
    provider: 'local',
    model: LOCAL_EMBEDDING_MODEL,
  });
}
