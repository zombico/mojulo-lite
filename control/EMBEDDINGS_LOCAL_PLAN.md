# Embeddings: Cohere → Local ONNX Model (transformers.js)

> **Supersedes** `EMBEDDINGS_BUILD_PLAN.md`. That plan chose Cohere on the
> premise that bundling a model = "1GB download." That premise was wrong:
> multilingual MiniLM in ONNX is ~120MB, runs in Node via `onnxruntime-node`,
> and eliminates the runtime factory dependency entirely. Bots become
> self-sufficient — aligned with the droid-control framing.

## Goal

Replace Cohere as the embedding provider on **both** sides of the cosine
search with a local ONNX model running via `@huggingface/transformers`. The
control plane embeds the corpus at vectorize time. The deployed bot embeds
user queries at runtime, in-process. No network calls to embed at any phase.

## Why now

1. **Wizard preview never tested vectors.** [/api/preview/chat](mojulo-lite/control/app/api/preview/chat/route.js)
   uses `SimpleRAG` (keyword) regardless of `ragMode`. Shipping vector mode
   today means shipping untested code paths to production.
2. **Bot phones home for every query.** Vector RAG is currently a runtime
   dependency on the factory's `/api/embed`. If the factory is down, vector
   bots are down. That's fine for keyword bots (none of which need the
   factory at runtime); it's wrong for vector bots, since the whole pitch is
   "deploy the artifact and walk away."
3. **Operator burden.** Vector mode requires the operator to obtain and
   register a Cohere key. Local model removes a setup step.

## Non-goals

- No hybrid search, MMR, re-rank. Top-k cosine, same as today.
- No partial migration. Vector mode = local ONNX everywhere or nothing.
- No silent fallback if the model fails to load. Hard fail with clear error.
- No on-the-fly model download at runtime. Weights ship in the image.
- Existing Cohere-embedded artifacts stay legible (model field is recorded);
  any redeploy re-embeds with the new model. Don't try to maintain
  cross-model compatibility — vectors live in different geometric spaces
  and mixing is wrong.

---

## Model selection

**Choose: `Xenova/multilingual-e5-small`** (or near equivalent — finalize during impl).

| Candidate | Dim | ONNX size | Multilingual | Notes |
|---|---|---|---|---|
| `Xenova/multilingual-e5-small` | 384 | ~120MB | 100+ langs | Good ja/zh/ko coverage; query/doc prefix convention |
| `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 384 | ~120MB | 50 langs | Older, slightly weaker on long contexts |
| `Xenova/bge-m3` | 1024 | ~2.3GB | excellent | Same model the dragbot-control uses; too heavy for lite's "tiny artifact" ethos |
| `Xenova/all-MiniLM-L6-v2` | 384 | ~25MB | English only | Disqualified — corpus has Japanese |

`multilingual-e5-small` is the sweet spot: small enough to bake in, strong
enough on the SkyShield-style multilingual corpora the lite product
targets. Dimension drops 1024 → 384, so embeddings.json shrinks ~62%.

**Important:** e5 models expect prefixes — `passage: <text>` for corpus,
`query: <text>` for queries. The `cohere.js` `inputType` flag becomes a
prefix-applier in the new client.

## Where weights live

**In the lite-template image, fetched at build time, never committed to git.**

- `lite-template/models/Xenova/multilingual-e5-small/` — tokenizer + config
  files are tracked in git; the `onnx/model_quantized.onnx` blob (~113MB) is
  gitignored
- `lite-template/scripts/fetch-embed-model.mjs` runs as an npm `postinstall`
  hook — `npm ci` inside the Dockerfile downloads the q8 weights from the
  HuggingFace Hub on first build. Idempotent: re-runs short-circuit when the
  file is already cached
- Dockerfile must `COPY scripts/` before `RUN npm ci` so the postinstall has
  the fetcher available
- Runtime `helper/embedder-local.js` sets `env.allowRemoteModels = false` so
  the deployed bot never reaches HuggingFace — it loads only from `./models/`

**Why fetch instead of commit:** GitHub rejects pushes containing files over
100MB. The q8 ONNX is 113MB. We tried committing it; that's how this came
up. Postinstall fetch keeps the source clean and the build self-bootstraps.

**Why not lazy-download on first boot:** containers in customer environments
might not have outbound HuggingFace access; first-query latency would spike
to ~30s for the download; unpredictable failure mode. Bake at build time =
boring = good. Build still requires HF reachability, but that's a one-time
cost on the build host, not the runtime host.

**Image size impact:** lite-template is currently a few hundred MB. Adding
~120MB is acceptable and mostly model layer that caches well. If size matters
later we can switch to a smaller model or a quantized int8 variant.

The control plane uses the **same** weights — symlink or copy from
`lite-template/models/` to `control/lib/embedder/models/` at install time, or
just `require('@huggingface/transformers')` in both places and let the
library resolve from a shared cache directory. Decide during impl; matters
less than getting both sides on identical bytes.

---

## What gets removed

| File / chunk | Action |
|---|---|
| `control/lib/embedder/cohere.js` | **delete** |
| `control/app/api/embed/route.js` | **delete** — the proxy is no longer needed |
| `control/app/api/settings/embeddings-status/route.js` | **delete or repurpose** — `hasEmbeddingsProvider` becomes always-true; gate disappears |
| `lite-template/helper/embedder-client.js` | **delete** — no more factory round-trip |
| `EMBEDDER_URL` env var | remove from `.env.example`, `docker-compose.yml`, `docker.js` README writer |
| Cohere API key UX in Settings | remove the embeddings-provider card |
| `apiKeys` rows with provider='cohere' (embeddings) | leave alone; Cohere is also supported as an LLM provider in `llm-providers.js`, the row may still be in use for that. Don't auto-delete. |

## What gets added

### 1. `control/lib/embedder/local.js`

New module replacing `cohere.js`. Wraps `@huggingface/transformers`:

```js
import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.localModelPath = path.resolve(process.cwd(), 'lib/embedder/models');

let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'multilingual-e5-small', {
      quantized: true,
    });
  }
  return extractorPromise;
}

export async function generateEmbeddings(texts, { inputType }) {
  const prefix = inputType === 'search_query' ? 'query: ' : 'passage: ';
  const extractor = await getExtractor();
  const out = await extractor(
    texts.map((t) => prefix + t),
    { pooling: 'mean', normalize: true }
  );
  // out.tolist() → number[][]
  return out.tolist();
}

export const LOCAL_EMBEDDING_MODEL = 'multilingual-e5-small';
export const LOCAL_EMBEDDING_DIM = 384;
```

API-compatible signature with the old Cohere client (drops `apiKey`,
keeps `inputType`), so callers in `vectorize-rag` and `tool-executors`
need only an import swap + apiKey removal.

### 2. `lite-template/helper/embedder-local.js`

The Express bot's runtime equivalent. Same `pipeline()` API. Replaces
`embedder-client.js`. Loads once on first call (cold start ~1–3s),
warm thereafter.

```js
const { pipeline, env } = require('@huggingface/transformers');
const path = require('path');

env.allowRemoteModels = false;
env.localModelPath = path.join(__dirname, '..', 'models');

let extractor = null;
async function embedQuery(text) {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'multilingual-e5-small', {
      quantized: true,
    });
  }
  const out = await extractor(['query: ' + text], {
    pooling: 'mean',
    normalize: true,
  });
  return out.tolist()[0];
}

function cosineSimilarity(a, b) { /* unchanged */ }
function findSimilar(queryEmbedding, chunks, k = 3) { /* unchanged */ }

module.exports = { embedQuery, cosineSimilarity, findSimilar };
```

`vector-rag.js` imports `embedQuery` from this new file instead of
`embedder-client.js`. No other changes there.

### 3. Dockerfile (lite-template)

```dockerfile
# After deps install:
COPY models/ ./models/
```

Plus a build-time check that bails if `models/` is missing or corrupted —
better to fail the image build than ship a broken bot.

### 4. Wizard / chat builder UX

- `KnowledgeConfig` step: drop the "requires Cohere key" gate. Vector option
  always available. Keep the keyword/vector toggle — that's a real choice
  about retrieval semantics, not provider availability.
- `embeddings-status` polling: delete or change to a no-op returning
  `{ available: true, model: 'multilingual-e5-small' }`. The wizard form
  handler stops gating on `hasEmbeddingsProvider`.
- Chat builder system prompt (`lib/builder/system-prompt.js`): remove
  the "requires Cohere key" branch; vector mode is always available.
- `set_rag_mode` tool (`tool-executors.js`): drop the
  `preloadedContext.hasEmbeddingsProvider` precondition.

### 5. DB schema

`deployments.embedding_model` keeps recording the model used (now
`multilingual-e5-small` instead of `embed-multilingual-v3.0`). On boot, the
runtime can compare its bundled model name against the artifact's stored
name and refuse to start if they diverge — protects against re-embedding
the corpus with a new model and forgetting to rebuild a deployed bot.

No migration needed for existing rows. Old rows have
`embedding_model='embed-multilingual-v3.0'`; redeploy will overwrite. If
the operator never redeploys, the bot stays broken on next pull (mismatched
model) — accept this. Document in the migration runbook.

---

## Migration plan

### Phase 1 — control plane swap
1. Add `@huggingface/transformers` to `control/package.json`
2. Create `lib/embedder/models/multilingual-e5-small/` (download via a
   one-time helper script that pulls from HF — `scripts/fetch-embed-model.js`)
3. Add `lib/embedder/local.js`
4. Swap imports in `app/api/vectorize-rag/route.js` and
   `lib/builder/tool-executors.js`. Drop `decryptApiKey` /
   `ApiKeyRepository.findByProvider('cohere')` lookups.
5. Verify: upload a doc through the wizard, confirm `embeddings.json`
   payload has 384-dim vectors and `model: 'multilingual-e5-small'`.

### Phase 2 — bot side swap
1. Add `@huggingface/transformers` to `lite-template/package.json`
2. Add `lite-template/scripts/fetch-embed-model.mjs` and wire it as a
   `postinstall` hook so `npm ci` populates `lite-template/models/` from
   HuggingFace. Gitignore `models/**/*.onnx` (the 113MB blob exceeds GitHub's
   file size limit). Dockerfile copies `scripts/` before `npm ci` so the
   fetcher is available, and keeps `COPY models/` afterward as an idempotent
   overlay for the small tokenizer/config files that *are* tracked.
3. Add `lite-template/helper/embedder-local.js`
4. Update `lite-template/helper/vector-rag.js` to import from local helper
5. Delete `lite-template/helper/embedder-client.js`
6. Verify: build a fresh artifact, run `npm start`, send a chat with a
   query that should hit a known doc chunk, confirm retrieval works
   without `EMBEDDER_URL` set.

### Phase 3 — close the wizard test gap
This is the bonus payoff of the local approach. With embedding being a
pure function call, `/api/preview/chat` can honor `ragMode === 'vector'`:

```js
if (ragMode === 'vector' && embeddingsStorageKey) {
  const blob = await downloadToBuffer(embeddingsStorageKey);
  const payload = JSON.parse(blob.toString());
  ragInstance = new VectorRAGPreview(payload, generateEmbeddings);
}
```

A trivial `VectorRAGPreview` class that mirrors `lite-template/helper/vector-rag.js`
but takes the in-memory payload instead of reading from disk. Now the
Puppeteer test actually exercises vector retrieval before deploy.

### Phase 4 — cleanup
1. Delete `lib/embedder/cohere.js`
2. Delete `app/api/embed/route.js`
3. Delete `app/api/settings/embeddings-status/route.js` (or stub)
4. Remove embedder-provider Settings UI
5. Remove `EMBEDDER_URL` from `.env.example`, docker-compose, README writers
6. Update `EMBEDDINGS_BUILD_PLAN.md` header: "Superseded by
   EMBEDDINGS_LOCAL_PLAN.md"
7. Update `mojulo-lite/ARCHITECTURE.md` to drop Cohere references

---

## Risks & open questions

| Risk | Mitigation |
|---|---|
| **Cold start latency**: first query loads ~120MB into RAM | Trigger model load on server start, not first request. `vector-rag.js initialize()` already runs at boot — extend it to call `embedQuery('warmup')` once. |
| **Image size +120MB** | Acceptable for the bot's use case. If size becomes critical, switch to int8-quantized variant (~30MB). |
| **Quality regression vs Cohere v3** | Spot-check on real customer corpora. e5-small isn't as strong as Cohere v3 on nuanced multilingual. If quality is unacceptable, escalate to `bge-m3` (2.3GB) as opt-in. |
| **`onnxruntime-node` native binary** | It's pre-built per arch; the Dockerfile is `linux/amd64` only. If we add arm64 in the future, ensure the right binary is present. |
| **Tokenizer mismatch** | e5 expects sentencepiece. `transformers.js` ships its own tokenizer JS port; verify it produces identical tokens to the Python reference on a small Japanese sample before committing. |
| **Existing artifacts break on rebuild** | Document loudly: this migration requires re-embedding all vector-mode deployments. Keyword-mode deployments are unaffected. |

## Open questions for next session

1. Quantization: ship int8 (~30MB, slight quality cost) or fp32 (~120MB)?
   Decide after measuring quality on a real corpus.
2. Should the control plane and lite-template share a single `models/`
   directory at the monorepo root, or duplicate? Single source is cleaner
   but complicates the lite-template's standalone Docker build context.
3. Is there a customer who has *deployed* a Cohere vector bot in production?
   If yes, coordinate the redeploy. If no (likely, given the test gap), we
   can move without coordination.

---

*Plan drafted 2026-04-29. Author intent: local ONNX model on both sides,
no network calls for embedding, bot fully self-sufficient post-deploy.*
