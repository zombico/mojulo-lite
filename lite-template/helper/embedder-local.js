/**
 * Local embedding client for the bot artifact.
 *
 * Mirror of the control plane's lib/embedder/local.js — same model, same
 * dtype, same prefix convention — so the corpus baked at build time and
 * the queries embedded at runtime live in the same vector space.
 *
 * Loads weights from ./models/ (copied into the image at build time).
 * No network calls. No factory dependency. The bot is self-sufficient.
 *
 * `@huggingface/transformers` is ESM; this file is CommonJS, so we use
 * a dynamic import. The lazily-loaded extractor is cached for the
 * process lifetime.
 */

const path = require('path');

const MODEL_ID = 'Xenova/multilingual-e5-small';
const DTYPE = 'q8';
const MODELS_DIR = path.join(__dirname, '..', 'models');

let extractorPromise = null;

async function loadExtractor() {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = MODELS_DIR;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  return pipeline('feature-extraction', MODEL_ID, { dtype: DTYPE });
}

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = loadExtractor().catch((err) => {
      extractorPromise = null;
      throw new Error(
        `Failed to load embedding model from ${MODELS_DIR}. ` +
          `The artifact image must include the ONNX weights. Cause: ${err.message}`
      );
    });
  }
  return extractorPromise;
}

/**
 * Embed a single user query. Returns an L2-normalized 384-dim vector.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedQuery(text) {
  if (!text || !text.trim()) {
    throw new Error('embedQuery: text required');
  }
  const extractor = await getExtractor();
  const out = await extractor(['query: ' + text], {
    pooling: 'mean',
    normalize: true,
  });
  return out.tolist()[0];
}

/**
 * Optional warmup — call once at server boot so the first user query
 * doesn't pay the ~2s cold-start cost.
 */
async function warmup() {
  await embedQuery('warmup');
}

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

module.exports = { embedQuery, warmup, cosineSimilarity, findSimilar };
