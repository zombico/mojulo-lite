# Lite Embeddings Build Plan

> ⚠️ **Superseded by [EMBEDDINGS_LOCAL_PLAN.md](./EMBEDDINGS_LOCAL_PLAN.md)** (2026-04-29).
> The Cohere-based architecture below was implemented but never tested
> end-to-end (the wizard preview used SimpleRAG regardless of ragMode), and
> required bots to phone home to the factory at every query — at odds with
> the "deploy the artifact and walk away" pitch. Replaced with a bundled
> multilingual-e5-small ONNX model via @huggingface/transformers running
> in-process on both control plane and bot. The "1GB model download" line
> below was an overestimate — q8 quantized weights are ~113MB. Kept here
> as historical context.

## Goal

Add an optional **vector RAG cartridge** to lite, using Cohere's hosted embedding API as the vector provider. Embeddings are generated eagerly at wizard time, baked into the artifact at build, and served at runtime by a `VectorRAG` sibling to `SimpleRAG`. The factory exposes a thin `/api/embed` proxy so bots can embed queries at runtime without each operator needing their own Cohere key.

Brutalist: per-deployment keying, filesystem storage, no caching across deployments, no hybrid search, no fallback to keyword once vector mode is chosen. The wizard forces a choice between keyword and vector on the knowledge step. Once chosen, the cartridge is hardwired to that mode.

**Why Cohere, not Infinity / not @xenova / not bundled local model:** lite is pure Node. Bundling Infinity = Docker tier (5GB image, multi-service compose). Bundling `@xenova/transformers` = 1GB model download on first run. Cohere is one HTTP call, zero infra, multilingual (`embed-multilingual-v3.0` lines up with the existing locale work), trivial cost (~$0.10/M tokens — a typical SMB corpus costs a fraction of a cent to embed). Node purity stays intact.

## Non-goals

- No document-level embedding cache. Embeddings live and die with the deployment row.
- No re-rank, MMR, hybrid keyword+vector. Top-k cosine, that's it.
- No bundled embedding model in the artifact or factory. Cohere is the embedder.
- No partial vector mode. All-on or all-off per deployment, locked at wizard time.
- No silent fallback to keyword if vector mode fails. Hard fail with clear log.

---

## What exists already

| Piece | Where | Status |
|---|---|---|
| Runtime Infinity client (`generateEmbedding`, `findSimilar`, `cosineSimilarity`) | [lite-template/helper/infinity-client.js](mojulo-lite/lite-template/helper/infinity-client.js) | ⚠️ keep `cosineSimilarity` + `findSimilar`; rewrite `generateEmbedding` to call factory's `/api/embed` |
| `process_documents` tool (parse + LLM ragSummary) | [tool-executors.js:343](mojulo-lite/control/lib/builder/tool-executors.js#L343) | ✅ extend with vector branch |
| Filesystem storage at `data/storage/` | [lib/storage/index.js](mojulo-lite/control/lib/storage/index.js) | ✅ reuse — same module |
| Build pipeline writes `documents/*.txt`, `config/ragSummary.txt` | [docker.js:296-305](mojulo-lite/control/lib/deployers/docker.js#L296-L305) | ✅ extend with vector branch |
| Runtime SimpleRAG (keyword) | [lite-template/helper/rag.js](mojulo-lite/lite-template/helper/rag.js) | ✅ keep — vector is sibling, not replacement |
| API key storage (provider, encrypted key) | `api_keys` table + `ApiKeyRepository` | ✅ extend — Cohere becomes a recognized provider |
| `buildArtifact()` standalone function | [lib/deployers/build.js](mojulo-lite/control/lib/deployers/build.js) | ✅ call eagerly at modular save (see §8) |

---

## What's new

### 1. Control-plane Cohere client + chunker

New file: `lib/embedder/cohere.js` — thin HTTP wrapper around `https://api.cohere.com/v2/embed`. Exports:
```js
generateEmbeddings(texts, { apiKey, model = 'embed-multilingual-v3.0', inputType }) → number[][]
```
Cohere accepts up to 96 texts per call; handle batching internally. `inputType` is `search_document` for corpus, `search_query` for runtime queries.

New file: `lib/embedder/chunker.js` — splits parsed text into chunks (512 chars, 50-char overlap). Returns `[{ text, chunkIndex }]`. Pure function, no deps.

### 2. Settings: Cohere as a recognized provider

`ApiKeyRepository` already supports multi-provider. Add `'cohere'` to the allowlist in any provider validators. Settings UI gets an "Embeddings Provider" card (separate from LLM provider — different role) with a single Cohere key slot.

When the modular session boots, include `hasEmbeddingsProvider: boolean` in `preloadedContext` so the wizard and chat builder can gate the vector toggle accordingly.

### 3. Schema: per-deployment embedding columns

`deployments` table — add:
```sql
embedding_storage_key TEXT  -- nullable; e.g., "embeddings/{deployment_id}.json"
embedding_model       TEXT  -- e.g., "embed-multilingual-v3.0"
embedding_chunk_count INTEGER
rag_mode              TEXT  -- 'keyword' | 'vector', defaults to 'keyword'
```

Migration: `PRAGMA table_info` guard pattern (already used for `url`/`last_seen_at`).

Repository methods on `DeploymentRepository`:
- `setEmbeddings(id, { storageKey, model, chunkCount })`
- `clearEmbeddings(id)`
- `setRagMode(id, mode)`

No separate table. Embeddings are per-deployment 1:1.

### 4. Wizard: forced choice on the knowledge step

`KnowledgeConfig` step gets a toggle at the top:

```
RAG Strategy
( ) Keyword search       — fast, offline, no API key needed
(•) Vector embeddings    — better recall, requires Cohere key
                          [Add key in settings →]   (when key absent)
```

Default: vector if Cohere key exists in settings, keyword if not. When key is absent, the vector option is disabled with the inline link.

The choice writes to `formData.knowledge.ragMode` which cascades into:
- `process_documents` behavior (vector branch chunks + embeds; keyword branch stays the existing summary-only path)
- The build pipeline (vector branch copies embeddings.json; keyword branch copies docs + ragSummary)
- The deployment row's `rag_mode` column at save time

Editing an existing deployment carries the existing `rag_mode` forward but allows toggling — switching modes invalidates the artifact (config_hash changes).

### 5. Wizard tool: extend `process_documents` for vector branch

In [tool-executors.js:343](mojulo-lite/control/lib/builder/tool-executors.js#L343), branch on `session.knowledge.ragMode`:

**Keyword branch (existing):** parse + LLM ragSummary. No changes.

**Vector branch (new):**
1. Parse documents (existing logic)
2. Chunk parsed text via `lib/embedder/chunker.js`
3. Look up the operator's Cohere key via `ApiKeyRepository.findByProvider('cohere')`
4. Call `generateEmbeddings(chunks.map(c => c.text), { apiKey, inputType: 'search_document' })` in batches of 96
5. Build `[{ text, embedding, metadata: { documentId, originalName, chunkIndex } }]`
6. `uploadFile('embeddings/{session-or-deployment-id}.json', Buffer.from(JSON.stringify({ model, chunkCount, chunks })))`
7. Stash the storage key in `session.generatedConfigs.embeddings = { storageKey, model, chunkCount }`

If the Cohere call fails mid-batch: wipe the partial JSON, mark the session's embeddings step as failed, surface a clear error in the tool-status stream. No silent partial state.

When the session saves to a deployment row, copy `session.generatedConfigs.embeddings.*` into `deployment.embedding_*` columns and set `rag_mode='vector'`.

### 6. Chat builder mirror: `set_rag_mode` tool

New tool definition in `lib/builder/tools.js`:
```js
{
  name: 'set_rag_mode',
  description: 'Lock the RAG strategy for this bot. Vector requires a Cohere key.',
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['keyword', 'vector'] },
    },
    required: ['mode'],
  },
}
```

System prompt directive:
> After documents are uploaded but before calling `process_documents`, you MUST call `set_rag_mode`. If `preloadedContext.hasEmbeddingsProvider === true`, ask the user: "Want better recall via vector embeddings (uses your Cohere key), or keep it simple with keyword search?" If the key is absent, set `mode='keyword'` silently and mention "Vector mode requires a Cohere key — add one in Settings to enable."

`process_documents` reads `session.knowledge.ragMode` (set by `set_rag_mode`) and branches per §5.

### 7. Build pipeline: pull embeddings into artifact

In [lib/deployers/docker.js](mojulo-lite/control/lib/deployers/docker.js#L274), after writing `config.json`:

```js
if (deployment.rag_mode === 'vector' && deployment.embedding_storage_key) {
  const embeddingsBuffer = await downloadToBuffer(deployment.embedding_storage_key);
  await fsp.writeFile(
    path.join(configDir, 'embeddings.json'),
    embeddingsBuffer
  );
  configJson.config.rag = {
    ...(configJson.config.rag || {}),
    mode: 'vector',
  };
}
```

Build is pure copy. No Cohere call at build time. Re-build = re-copy. Cartridge contract holds.

For keyword-mode deployments, the existing `documents/*.txt` + `ragSummary.txt` flow is unchanged. For vector-mode, those are NOT emitted (vector mode is exclusive — the bot retrieves only against the baked embeddings).

### 8. Eager artifact build at modular save

[lib/builder/executor.js](mojulo-lite/control/lib/builder/executor.js) currently writes the deployment row and stops at `status=saved`. Extend `saveBuilderConfig` to immediately call `buildArtifact(deployment.id)` after the row is written, in the same request:

```js
const deployment = await DeploymentRepository.create({ ... });
const built = await buildArtifact(deployment.id);   // ← new
return {
  deploymentId: deployment.id,
  status: built.deployment.status,    // 'ready'
  artifactPath: built.artifactPath,
  downloadUrl: `/api/deployments/${deployment.id}/download`,
};
```

The user clicks "Deploy" and gets a downloadable artifact in one response. The lazy-build path on `/download` stays as a fallback for cases where the artifact got cleaned up.

UX: stream progress through the existing modular SSE channel — "Generating embeddings…", "Building artifact…", "Done." Don't let the request look hung; vector mode adds 5–30s of Cohere time depending on corpus size.

### 9. Runtime: `VectorRAG` sibling

New file: `lite-template/helper/vector-rag.js`:
- Boots from `config/embeddings.json` — loads `{ model, chunks: [{ text, embedding, metadata }] }` into memory.
- `query(text, k=3)` calls the bot's local `embedQuery(text)` helper (which proxies to factory `/api/embed`), then `findSimilar(queryVec, this.chunks, k)`.
- Same surface as SimpleRAG's query method so server.js branches transparently.

Rewrite `lite-template/helper/infinity-client.js` → `lite-template/helper/embedder-client.js`:
- Drop `generateEmbedding` direct-to-Infinity call.
- New `embedQuery(text)` calls `${EMBEDDER_URL}/api/embed` (the factory proxy) with `{ text, inputType: 'search_query' }`.
- Keep `cosineSimilarity` + `findSimilar` — pure local compute.

In [lite-template/server.js:1418-1425](mojulo-lite/lite-template/server.js#L1418-L1425):
```js
const ragMode = config.config.rag?.mode || 'keyword';
if (ragMode === 'vector') {
  const VectorRAG = require('./helper/vector-rag');
  ragInstance = new VectorRAG(path.join(__dirname, 'config/embeddings.json'));
} else {
  ragInstance = new SimpleRAG(documentsPath, isTriageRoute, ragLocale);
}
await ragInstance.initialize();
```

### 10. Factory `/api/embed` proxy

New route: `app/api/embed/route.js`:
- `POST` with body `{ text, inputType }`.
- Authentication: bot sends its `MOJULO_API_KEY` as `x-mojulo-api-key`. Factory verifies it matches a known deployment row's `api_key`, AND that deployment is registered (`url IS NOT NULL`).
- Reads operator's Cohere key from settings.
- Calls `lib/embedder/cohere.js` with `inputType: 'search_query'` (single text, no batching).
- Returns `{ embedding: number[] }`.

Bot's `.env.example`:
```
# Vector RAG: point at your mojulo-lite factory's embedder.
# EMBEDDER_URL=http://your-factory:3001
```

If `EMBEDDER_URL` is unreachable at bot runtime, vector queries fail with a clear log line. No fallback to keyword (the artifact has no `documents/*.txt` to fall back to).

### 11. Operator install

Vector-mode bots have a runtime dep on the factory's `/api/embed` endpoint. That's the trade — the factory is the embedder, plus everything else it does. Operators who run the factory locally on a single machine and the bot on the same machine just point `EMBEDDER_URL=http://host.docker.internal:3001`. Operators with remote factory installations point at the factory's network address.

Keyword-mode bots have zero factory dependency at runtime — same as today.

---

## Storage shape

Single JSON file per deployment:

```json
{
  "model": "embed-multilingual-v3.0",
  "chunkCount": 247,
  "createdAt": "2026-04-29T12:00:00Z",
  "chunks": [
    {
      "text": "...512 char chunk...",
      "embedding": [0.012, -0.034, ...],
      "metadata": {
        "documentId": "doc_abc",
        "originalName": "policy.pdf",
        "chunkIndex": 0
      }
    }
  ]
}
```

Cohere `embed-multilingual-v3.0` produces 1024-dim float32 vectors. At ~250 chunks, the file is ~1MB. Trivially shippable inside the artifact zip.

Storage key: `embeddings/{deployment_id}.json` under `data/storage/` on the factory.

---

## Implementation order

1. **§1 control-plane Cohere client + chunker.** Standalone — testable with curl + a Cohere key.
2. **§2 settings provider gating.** Cohere key surfaces in settings; `hasEmbeddingsProvider` lands in `preloadedContext`.
3. **§3 schema migration + repository methods.** Boring but needs to land first so save-flow has somewhere to write.
4. **§4 wizard knowledge-step toggle.** UI lights up; choice writes to `formData.knowledge.ragMode`.
5. **§5 vector branch in `process_documents`.** Vector embeddings persist to `data/storage/embeddings/{id}.json`. Test: run wizard end-to-end, confirm JSON file appears.
6. **§6 chat builder `set_rag_mode` tool.** Conversational mirror works.
7. **§7 build pipeline branch.** Vector deployments get `embeddings.json`; keyword deployments unchanged.
8. **§8 eager artifact build.** Save returns a ready artifact path.
9. **§9 runtime VectorRAG.** End-to-end test: build a vector bot, run it, confirm cosine retrieval beats keyword on a fuzzy query.
10. **§10 factory `/api/embed` proxy.** Bot can reach the factory at runtime.
11. **§11 documentation pass on `.env.example` + README.**

§5 + §7 + §9 are the heart. The rest is wiring.

---

## Decisions made (not open)

- **Cohere as the embedding provider.** Pure HTTP, multilingual, cheap, zero infra. Aligns with the lite-stays-Node stance.
- **Per-deployment keying.** No document-level cache. Lite scale doesn't earn it.
- **Eager generation.** At wizard `process_documents`, not at build. Build is pure copy.
- **No hybrid.** Vector and keyword are exclusive. The artifact ships one or the other, not both.
- **Hard fail when `EMBEDDER_URL` unreachable in vector mode.** Clear log line beats silent degradation. Vector-mode artifacts don't carry keyword fallback material.
- **Forced choice at wizard time.** Knowledge step requires an explicit pick. No auto-detection. The user owns the decision; the artifact is hardwired.
- **Eager artifact build at modular save.** `save → ready` collapses into one request. Lazy-build on `/download` stays as fallback.
- **Factory exposes `/api/embed`.** Bots don't carry their own Cohere key; one operator-side key serves all bots.
- **Bot auth on `/api/embed`.** Bot uses its `MOJULO_API_KEY` (already baked into the artifact). Factory cross-checks against the registered deployments.
- **Triage in vector mode is deferred.** Vector mode for v1 is knowledge-protocol RAG only. Triage stays keyword (uses the per-route `documents/{deploymentId}_*.txt` files emitted by §4 of TRIAGE_BUILD_PLAN). Re-evaluate after v1 ships.

## Open questions

- **Storage key timing.** Generate embeddings under `embeddings/{session_id}.json` during wizard, then rename to `embeddings/{deployment_id}.json` at save? Or use the deployment ID from session boot? Pick the simpler one during §5.
- **Re-embedding triggers.** When the user edits a deployment and changes documents (or flips `rag_mode`), the existing `config_hash` change should invalidate embeddings. Confirm `embedding_storage_key` is cleared (or regenerated) on doc list changes.
- **Cohere batching + rate limits.** 96 texts per call, ~10 RPS. For typical SMB corpora well within limits; flag for any corpus >5k chunks (future).
- **Edit-mode UX.** When editing a vector-mode bot, the toggle lets you switch to keyword. Switching to keyword should clear the stored embeddings. Switching to vector should re-embed. Confirm this in §4 implementation — the toggle change is what triggers the re-`process_documents` call.
- **Bot-to-factory networking.** Operators running the bot on a different machine than the factory need a reachable `EMBEDDER_URL`. Document the common topologies (same-machine via `host.docker.internal`, LAN via factory's IP, public via reverse proxy).
