/**
 * Pre-download the embedding model into lib/embedder/models/ so that
 * runtime calls never need network access. Run after `npm install`.
 *
 *   node scripts/fetch-embed-model.js
 *
 * The download is idempotent — if the q8 ONNX file is already present,
 * transformers.js short-circuits to the cache.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir =
  process.env.MOJULO_MODELS_DIR ||
  path.resolve(__dirname, '..', 'lib', 'embedder', 'models');
env.cacheDir = modelsDir;
env.allowRemoteModels = true;

const MODEL_ID = 'Xenova/multilingual-e5-small';
const DTYPE = 'q8';

console.log(`Fetching ${MODEL_ID} (dtype=${DTYPE}) into ${modelsDir}…`);
const t0 = Date.now();
const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: DTYPE });
console.log(`Loaded in ${Date.now() - t0}ms.`);

const probe = await extractor(['query: warmup'], { pooling: 'mean', normalize: true });
const dims = probe.dims;
console.log(`Probe shape: [${dims.join(', ')}]`);

const expectedOnnx = path.join(
  modelsDir,
  'Xenova',
  'multilingual-e5-small',
  'onnx',
  'model_quantized.onnx'
);
if (!existsSync(expectedOnnx)) {
  console.error(`ERROR: expected ONNX file missing at ${expectedOnnx}`);
  process.exit(1);
}
console.log(`Model ready at ${expectedOnnx}`);
