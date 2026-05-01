/**
 * VectorRAGPreview — in-memory mirror of lite-template/helper/vector-rag.js
 * for the wizard's /api/preview/chat path.
 *
 * The deployed bot loads embeddings.json from disk; the preview hydrates
 * the same payload from a downloadToBuffer() call. Same retrieval semantics,
 * same query-side prefix, same cosine math. This is what closes the gap
 * where the wizard's "test the bot" button used SimpleRAG (keyword)
 * regardless of ragMode.
 */

import { generateEmbeddings } from './local.js';

function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('Vectors must have same length');
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function findSimilar(queryEmbedding, chunks, k = 3) {
  const scored = chunks.map((chunk) => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
    metadata: chunk.metadata,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export default class VectorRAGPreview {
  /**
   * @param {{ chunks: Array<{ text: string, embedding: number[], metadata?: Object }>, model?: string }} payload
   */
  constructor(payload) {
    this.chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
    this.model = payload?.model || null;
    this.isLoaded = this.chunks.length > 0;
    this.lastSearchResults = null;
    this.mode = 'vector';
  }

  // No-op for parity with SimpleRAG/VectorRAG initialize().
  async initialize() {
    return;
  }

  async search(query, maxResults = 3) {
    if (!this.isLoaded) return '';
    const cleanQuery = (query || '').trim();
    if (cleanQuery.length < 3) return '';

    const [queryVec] = await generateEmbeddings([cleanQuery], { inputType: 'search_query' });
    const top = findSimilar(queryVec, this.chunks, maxResults);

    if (top.length === 0) {
      this.lastSearchResults = null;
      return '';
    }

    this.lastSearchResults = top.map((hit) => ({
      filename: hit.metadata?.originalName || 'unknown',
      content: hit.text,
      score: hit.score,
      chunkIndex: hit.metadata?.chunkIndex ?? null,
    }));

    return top
      .map((hit, i) => {
        const prefix = top.length > 1 ? `[${i + 1}] ` : '';
        const filename = hit.metadata?.originalName || 'document';
        return `${prefix}[From ${filename}]:\n${hit.text}`;
      })
      .join('\n\n---\n\n');
  }

  getLastSearchResults() {
    return this.lastSearchResults;
  }
}
