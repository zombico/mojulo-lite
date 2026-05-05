# Vector RAG

Mojulo-Lite bots retrieve relevant context for each user turn using a **single in-process vector index**, embedded with `multilingual-e5-small` (q8 ONNX). No external embedding API, no network calls at retrieval time, no separate keyword fallback path. Both knowledge documents and triage routes live in the same cosine index.

This doc describes how the index is built, how it ships, and how it gets queried.

---

## Why this shape

Three properties drive the design:

1. **Offline at runtime.** The bot is a portable artifact — it has to work behind a firewall, on a laptop in airplane mode, in a region with no embedding-provider access. So query embedding runs in-process from a model file baked into the Docker image, not against a remote API.
2. **Multilingual without language detection.** `multilingual-e5-small` handles cross-lingual semantics natively, so a Thai query against a Spanish document corpus retrieves the right chunks without locale detection, stopword tables, or query-rewrite ladders. The previous keyword + locale-detect path is gone (~1700 LOC removed).
3. **One retrieval path for two purposes.** Triage routes ("if the user asks X, hand them to deployment Y") and knowledge documents go through the same chunker and the same cosine index. Retrieval-time formatting renders them differently so the LLM sees a routing signal vs. a document quote, but the index doesn't branch.

---

## The model

| Property         | Value                                                  |
|------------------|--------------------------------------------------------|
| Model ID         | `Xenova/multilingual-e5-small`                         |
| Dtype            | `q8` (8-bit quantization)                              |
| Output dimension | 384, L2-normalized                                     |
| Pooling          | Mean over token embeddings                             |
| Runtime          | `@huggingface/transformers` (transformers.js) + ONNX runtime |
| Disk size        | ~113 MB (the quantized ONNX file)                      |

`multilingual-e5-small` requires **prefixed inputs** by convention:

- `passage: <text>` for corpus chunks (build time)
- `query: <text>` for retrieval queries (runtime)

The prefix convention is owned inside the embedding modules ([control/lib/embedder/local.js](../control/lib/embedder/local.js), [lite-template/helper/embedder-local.js](../lite-template/helper/embedder-local.js)) so callers stay model-agnostic.

The same model + dtype + prefix convention runs at build time (control plane) and at runtime (bot artifact) — corpus vectors and query vectors live in the same geometric space.

---

## Build time: producing `embeddings.json`

The wizard or chat builder calls [POST /api/vectorize-rag](../control/app/api/vectorize-rag/route.js), passing a list of documents and/or triage routes. The endpoint:

1. **Hydrates document text.** If a document has a DB id, the parsed text is read from `documents.parsed_text`; otherwise the raw file is fetched from storage and parsed via [document-parser](../control/lib/document-parser.js).
2. **Chunks everything** through [chunker.js](../control/lib/embedder/chunker.js):
   - `chunkDocuments` produces 512-character windows with 50-character overlap. Locale-agnostic — no sentence splitting, just stable overlapping substrings. The embedding model handles tokenization on its end.
   - `chunkTriageRoutes` produces **one chunk per route** (descriptions are short — no sub-chunking) and tags each with `metadata: { source: 'triage-route', deploymentId, originalName }`.
3. **Embeds the combined chunk list** in a single batch through [generateEmbeddings](../control/lib/embedder/local.js) with `inputType: 'search_document'`. Each chunk becomes a 384-dim L2-normalized float array.
4. **Writes a single JSON blob** to storage at `embeddings/wizard-{token}.json`.

The blob's shape:

```json
{
  "model": "multilingual-e5-small",
  "chunkCount": 247,
  "createdAt": "2026-05-05T12:34:56.789Z",
  "chunks": [
    {
      "text": "passage chunk text...",
      "embedding": [0.012, -0.083, ...],
      "metadata": {
        "documentId": "doc_abc",
        "originalName": "policy.pdf",
        "chunkIndex": 0
      }
    },
    {
      "text": "Handles billing questions, payment plan changes...",
      "embedding": [0.043, 0.157, ...],
      "metadata": {
        "source": "triage-route",
        "deploymentId": "dep_billing_xyz",
        "originalName": "billing-bot",
        "chunkIndex": 0
      }
    }
  ]
}
```

The two metadata shapes differ (`documentId` vs `source: 'triage-route'`) but the chunk shape (`text` + `embedding` + `metadata`) is uniform.

When the operator clicks **Deploy**, [DockerDeployer](../control/lib/deployers/docker.js) copies the blob bit-for-bit into the artifact at `config/embeddings.json`. No re-embedding at deploy time — the same vectors that were generated when the wizard last saved are what ship.

**Bots with neither knowledge nor triage routes ship no `embeddings.json`** and run with RAG disabled — the LLM still has its protocol cartridges, just no retrieval-augmented context.

---

## How the model gets into the bot image

The bot's runtime expects the ONNX weights at `lite-template/models/Xenova/multilingual-e5-small/`. The 113 MB ONNX file is **gitignored** (it exceeds GitHub's 100 MB blob limit) and pulled at image build time.

The mechanism:

1. [scripts/fetch-embed-model.mjs](../lite-template/scripts/fetch-embed-model.mjs) is wired to `npm postinstall` in `package.json`, so it runs automatically after `npm ci` / `npm install`. It uses `transformers.js` to download the q8 ONNX into `./models/`. Idempotent — short-circuits when the file is already present.
2. The Dockerfile runs `npm ci --only=production` *before* copying source, so the postinstall hook fetches the weights into the image's `./models/` directory.
3. The Dockerfile then `COPY models/ ./models/` overlays the small tokenizer/config files that *do* live in git on top of the fetched cache. Idempotent overlay.

At runtime, [embedder-local.js](../lite-template/helper/embedder-local.js) sets:

```js
env.cacheDir = MODELS_DIR;
env.allowRemoteModels = false;
env.allowLocalModels = true;
```

`allowRemoteModels = false` is the offline guarantee — even if the bot has network access, transformers.js will not phone home for the model. If the ONNX weights are missing, the bot fails loudly at first query: *"Failed to load embedding model from /app/models. The artifact image must include the ONNX weights."*

---

## Runtime: query → retrieval → prompt

### Boot

[server.js](../lite-template/server.js) on startup:

1. Resolves `embeddingsPath` from `config.rag.embeddingsPath` (default `./config/embeddings.json`).
2. If the file exists, instantiates a `VectorRAG` and calls `initialize()` — which reads the JSON blob and pulls the chunk array into memory.
3. Calls `warmup()` ([embedder-local.js](../lite-template/helper/embedder-local.js)) which embeds the string `'warmup'` to force the ONNX runtime to load the weights into memory. This avoids the ~2s cold-start cost on the first user query. Warmup failures are non-fatal — queries retry the load on demand.

If `embeddings.json` is absent, the server logs `No embeddings at <path>, RAG disabled` and `ragInstance` stays `null`. All other endpoints work normally.

### Per-query flow

```
 Browser              server.js              VectorRAG            embedder-local
   │                       │                     │                     │
   │ POST /chat            │                     │                     │
   │ { prompt, ... }       │                     │                     │
   ├──────────────────────▶│                     │                     │
   │                       │ assemblePrompt()    │                     │
   │                       │ (prompt-assembler.js)                     │
   │                       │                     │                     │
   │                       │ rag.search(prompt, 3)                     │
   │                       ├────────────────────▶│                     │
   │                       │                     │ embedQuery(         │
   │                       │                     │   'query: ' + text) │
   │                       │                     ├────────────────────▶│
   │                       │                     │                     │ ONNX inference
   │                       │                     │◀────────────────────┤ → 384-dim vector
   │                       │                     │                     │
   │                       │                     │ findSimilar(        │
   │                       │                     │   queryVec,         │
   │                       │                     │   chunks, 3)        │
   │                       │                     │  → cosine over      │
   │                       │                     │    in-memory chunks │
   │                       │                     │  → top-3 by score   │
   │                       │                     │                     │
   │                       │                     │ format snippets:    │
   │                       │                     │  triage-route → with│
   │                       │                     │    deploymentId tag │
   │                       │                     │  document → with    │
   │                       │                     │    [From <file>]    │
   │                       │◀────────────────────┤ joined string       │
   │                       │                     │                     │
   │                       │ inject into prompt: │                     │
   │                       │  "Relevant info     │                     │
   │                       │   from documents:   │                     │
   │                       │   <snippets>"       │                     │
   │                       │                                           │
   │                       │ llm.generate(...)                         │
   │                       │ persist turn + ragSources                 │
   │◀──────────────────────┤                                           │
```

The cosine math is dead simple — `findSimilar` in [embedder-local.js](../lite-template/helper/embedder-local.js) maps over every chunk, computes cosine similarity against the query vector, sorts descending, and slices the top `k`. No HNSW, no faiss, no approximate nearest neighbors. For chunk counts in the hundreds-to-low-thousands range (the common case), a brute-force scan over 384-dim vectors is faster than any index's startup cost and avoids the operational tax of maintaining one.

A query under 3 characters or one that matches the form-submission marker (`{fieldId-filled}` or `{fieldId-skipped}`) is short-circuited — RAG is bypassed entirely. The form-submission shortcut prevents the bot from "researching" what amounts to an internal state-machine event.

### Result formatting

`vector-rag.js` formats the top-`k` results into a single string before returning. Each chunk's `metadata.source` decides the prefix:

```
[From policy.pdf]:
<chunk text>

---

[Triage route — deploymentId: dep_billing_xyz | name: billing-bot]:
Handles billing questions, payment plan changes, and refund requests…

---

[From handbook.md]:
<chunk text>
```

The instructions cartridge tells the LLM how to consume both forms — knowledge chunks become quotable context, triage-route chunks become "if this looks like the right destination, propose a triage card with this `deploymentId`."

The full structured result (per-chunk filename, score, chunkIndex, source, deploymentId) is also captured in `lastSearchResults` and returned alongside the LLM response in `data.sources` for the client log UI and downstream analytics.

### Where RAG context lands in the prompt

[prompt-assembler.js](../lite-template/helper/prompt-assembler.js) injects the result string under a fixed header:

```
Relevant information from documents:
<formatted results>
```

…or, on a miss:

```
Note: No matching information found in the available documents for this query.
```

The miss line is deliberate — it gives the LLM a known signal so it doesn't fabricate citations from chunks that weren't actually retrieved.

The whole RAG block sits between the instructions cartridge and the conversation history in the assembled prompt.

---

## What's stored per turn

After each `/chat` call, the persisted row in `turns` includes a `rag_context` column with the full structured result list (filename, score, chunkIndex, source, deploymentId, content). That makes every retrieval **auditable** — `/api/conversations/:id` exposes the exact chunks the LLM saw for any given turn, so an operator reviewing transcripts can see whether a wrong answer came from bad retrieval or bad LLM reasoning given good retrieval.

---

## Disabling RAG

There are two ways RAG ends up disabled:

1. **Build time:** the operator selected no knowledge documents and no triage routes. The artifact ships without `config/embeddings.json`. Server boots with `ragInstance = null` and `assemblePrompt` skips the search call entirely.
2. **Runtime:** `config/embeddings.json` exists but is unreadable or has zero chunks. `VectorRAG.initialize()` throws; the server logs the failure and continues with `ragInstance = null`. (This is a config-mistake path, not a happy path.)

In both cases, `/health` reports `rag: false` and `/metrics` exposes `mojulo_rag_chunks_loaded: 0`.

---

## File map

| File | Role |
|------|------|
| [control/lib/embedder/chunker.js](../control/lib/embedder/chunker.js) | `chunkDocuments` (512/50 sliding window) + `chunkTriageRoutes` (one chunk per route) |
| [control/lib/embedder/local.js](../control/lib/embedder/local.js) | Build-time embedding via transformers.js + ONNX. Owns the `passage:` / `query:` prefix convention |
| [control/app/api/vectorize-rag/route.js](../control/app/api/vectorize-rag/route.js) | Wizard-side endpoint: parse → chunk → embed → write `embeddings/wizard-{token}.json` |
| [control/lib/deployers/docker.js](../control/lib/deployers/docker.js) | Copies the storage blob into the artifact at `config/embeddings.json` |
| [lite-template/scripts/fetch-embed-model.mjs](../lite-template/scripts/fetch-embed-model.mjs) | npm `postinstall` hook that downloads the q8 ONNX into `./models/` at image build time |
| [lite-template/Dockerfile](../lite-template/Dockerfile) | Runs `npm ci` (triggers postinstall) then `COPY models/ ./models/` to overlay tokenizer/config |
| [lite-template/helper/embedder-local.js](../lite-template/helper/embedder-local.js) | Runtime query embedding; `env.allowRemoteModels = false` (offline guarantee). Exports `embedQuery`, `warmup`, `findSimilar` |
| [lite-template/helper/vector-rag.js](../lite-template/helper/vector-rag.js) | `VectorRAG` class: loads `embeddings.json`, runs cosine retrieval, formats results with metadata-aware prefixes |
| [lite-template/helper/prompt-assembler.js](../lite-template/helper/prompt-assembler.js) | Injects the formatted RAG block into the LLM prompt under a fixed header |
| [lite-template/server.js](../lite-template/server.js) §boot | Initializes `VectorRAG` from `config.rag.embeddingsPath`, calls `warmup()` |
