/**
 * Local embedding client for the control plane.
 *
 * Loads multilingual-e5-small from the
 * pre-fetched ONNX cache at lib/embedder/models/ via @huggingface/transformers
 * and runs inference in-process. No network calls.
 *
 * The same model + dtype combo runs in the lite-template artifact at
 * runtime, so corpus and query vectors live in the same geometric space.
 *
 * e5 models expect prefixed inputs:
 *   - 'passage: <text>' for corpus chunks
 *   - 'query: <text>' for retrieval queries
 * This module owns that convention so callers stay model-agnostic.
 *
 * The cache dir resolves to MOJULO_MODELS_DIR if set (npx flow lands this at
 * ~/.mojulo/models), else the bundled lib/embedder/models/ next to this file
 * (clone-and-run flow).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Two modes:
//   - MOJULO_MODELS_DIR set (npx flow): cache lives under the user's home,
//     gets populated lazily on first call. Remote downloads enabled so the
//     fresh-dir case self-heals without a separate postinstall step.
//   - MOJULO_MODELS_DIR unset (clone-and-run flow): cache lives next to this
//     file, postinstall fills it. Remote downloads stay off — preserves the
//     current offline-after-install posture.
const USER_CACHE = !!process.env.MOJULO_MODELS_DIR;
env.cacheDir = process.env.MOJULO_MODELS_DIR || path.resolve(__dirname, 'models');
env.allowRemoteModels = USER_CACHE;
env.allowLocalModels = true;

const MODEL_ID = 'Xenova/multilingual-e5-small';
const DTYPE = 'q8';

export const LOCAL_EMBEDDING_MODEL = 'multilingual-e5-small';
export const LOCAL_EMBEDDING_DIM = 384;

let extractorPromise = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, { dtype: DTYPE }).catch(
      (err) => {
        extractorPromise = null;
        const hint = USER_CACHE
          ? `Lazy download from ${env.cacheDir} failed — check network / disk and retry.`
          : `Run "node scripts/fetch-embed-model.js" first.`;
        throw new Error(
          `Failed to load embedding model from ${env.cacheDir}. ${hint} Cause: ${err.message}`
        );
      }
    );
  }
  return extractorPromise;
}

/**
 * Generate embeddings for a list of texts. Returns L2-normalized
 * 384-dim float arrays parallel to the input.
 *
 * @param {string[]} texts
 * @param {Object} options
 * @param {'search_document' | 'search_query'} options.inputType
 * @returns {Promise<number[][]>}
 */
export async function generateEmbeddings(texts, { inputType } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('generateEmbeddings: texts must be a non-empty array');
  }
  if (inputType !== 'search_document' && inputType !== 'search_query') {
    throw new Error(
      "generateEmbeddings: inputType is required ('search_document' | 'search_query')"
    );
  }

  const prefix = inputType === 'search_query' ? 'query: ' : 'passage: ';
  const extractor = await getExtractor();
  const out = await extractor(
    texts.map((t) => prefix + t),
    { pooling: 'mean', normalize: true }
  );
  return out.tolist();
}
