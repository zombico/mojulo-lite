/**
 * Pure text chunker for vector embeddings.
 *
 * 512-character target with 50-char overlap. Locale-agnostic by design —
 * the embedding model handles tokenization on its end, so we just need
 * stable, overlapping windows. No sentence-aware splitting; the embedding
 * model recovers semantic boundaries fine from raw substrings.
 */

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_OVERLAP = 50;

/**
 * Split a single document into chunks suitable for embedding.
 *
 * @param {string} text
 * @param {Object} [opts]
 * @param {number} [opts.chunkSize=512]
 * @param {number} [opts.overlap=50]
 * @returns {Array<{ text: string, chunkIndex: number }>}
 */
export function chunkText(text, opts = {}) {
  const { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = opts;
  if (!text || typeof text !== 'string') return [];

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return [];

  if (normalized.length <= chunkSize) {
    return [{ text: normalized, chunkIndex: 0 }];
  }

  const stride = Math.max(1, chunkSize - overlap);
  const chunks = [];
  let chunkIndex = 0;
  for (let start = 0; start < normalized.length; start += stride) {
    const slice = normalized.slice(start, start + chunkSize).trim();
    if (slice.length === 0) continue;
    chunks.push({ text: slice, chunkIndex });
    chunkIndex++;
    if (start + chunkSize >= normalized.length) break;
  }
  return chunks;
}

/**
 * Chunk a batch of documents, attaching metadata so we can trace each chunk
 * back to its source.
 *
 * @param {Array<{ id: string, originalName: string, text: string }>} docs
 * @param {Object} [opts]
 * @returns {Array<{ text: string, metadata: { documentId: string, originalName: string, chunkIndex: number } }>}
 */
export function chunkDocuments(docs, opts = {}) {
  const out = [];
  for (const doc of docs || []) {
    const chunks = chunkText(doc.text, opts);
    for (const chunk of chunks) {
      out.push({
        text: chunk.text,
        metadata: {
          documentId: doc.id,
          originalName: doc.originalName,
          chunkIndex: chunk.chunkIndex,
        },
      });
    }
  }
  return out;
}
