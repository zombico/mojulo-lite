/**
 * Pre-download the embedding model into ./models/ so the Docker build
 * can bake it into the image and runtime stays offline.
 *
 *   node scripts/fetch-embed-model.mjs
 *
 * Wired to `postinstall` — runs automatically after `npm ci` /
 * `npm install`, including inside the Dockerfile build. Idempotent:
 * transformers.js short-circuits when the q8 ONNX is already cached.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(__dirname, '..', 'models');
env.cacheDir = modelsDir;
env.allowRemoteModels = true;

const MODEL_ID = 'Xenova/multilingual-e5-small';
const DTYPE = 'q8';

const expectedOnnx = path.join(
  modelsDir,
  'Xenova',
  'multilingual-e5-small',
  'onnx',
  'model_quantized.onnx'
);

if (existsSync(expectedOnnx)) {
  console.log(`Embedding model already present at ${expectedOnnx} — skipping fetch.`);
  process.exit(0);
}

console.log(`Fetching ${MODEL_ID} (dtype=${DTYPE}) into ${modelsDir}…`);
const t0 = Date.now();
const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: DTYPE });
console.log(`Loaded in ${Date.now() - t0}ms.`);

const probe = await extractor(['query: warmup'], { pooling: 'mean', normalize: true });
console.log(`Probe shape: [${probe.dims.join(', ')}]`);

if (!existsSync(expectedOnnx)) {
  console.error(`ERROR: expected ONNX file missing at ${expectedOnnx}`);
  process.exit(1);
}
console.log(`Model ready at ${expectedOnnx}`);
