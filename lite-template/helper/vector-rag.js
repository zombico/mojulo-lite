/**
 * VectorRAG — runtime retrieval for the bot container.
 *
 * Boots from config/embeddings.json (built into the artifact at deploy time
 * by the factory's docker.js). Each query is embedded locally via the
 * bundled multilingual-e5-small ONNX model — no network calls — then
 * cosine retrieval runs in-process.
 *
 * If the model fails to load, queries fail loudly. There's no keyword
 * fallback — the artifact ships no source documents.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { embedQuery, findSimilar } = require('./embedder-local');

class VectorRAG {
  constructor(embeddingsPath) {
    this.embeddingsPath = path.resolve(embeddingsPath);
    this.chunks = [];
    this.model = null;
    this.isLoaded = false;
    this.lastSearchResults = null;
    this.mode = 'vector';
  }

  async initialize() {
    if (this.isLoaded) {
      console.log('🧬 VectorRAG already initialized');
      return;
    }
    if (!fs.existsSync(this.embeddingsPath)) {
      throw new Error(`Embeddings file missing at ${this.embeddingsPath}`);
    }
    const raw = await fsp.readFile(this.embeddingsPath, 'utf-8');
    const payload = JSON.parse(raw);

    if (!Array.isArray(payload.chunks) || payload.chunks.length === 0) {
      throw new Error(`Embeddings file at ${this.embeddingsPath} has no chunks`);
    }

    this.chunks = payload.chunks;
    this.model = payload.model || null;
    this.isLoaded = true;

    console.log(
      `🧬 VectorRAG loaded ${this.chunks.length} chunks (model: ${this.model || 'unknown'})`
    );
  }

  /**
   * Returns a string the LLM gets injected with, or '' on miss. Throws on
   * embedder/transport failures (no silent degrade).
   */
  async search(query, maxResults = 3) {
    if (!this.isLoaded || this.chunks.length === 0) {
      console.log('📭 VectorRAG not loaded or empty');
      return '';
    }
    const cleanQuery = (query || '').trim();
    if (cleanQuery.length < 3) return '';

    console.log(`🔍 VectorRAG search: "${cleanQuery}" over ${this.chunks.length} chunks`);

    const queryVec = await embedQuery(cleanQuery);
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
      source: hit.metadata?.source || 'document',
      deploymentId: hit.metadata?.deploymentId || null,
    }));

    // Triage route chunks surface their deploymentId inline so the LLM has a
    // direct routing signal alongside the description. The deploymentId is
    // authoritative on triageRoutes.json (loaded into context separately) —
    // the inline echo here is contextual reinforcement, not the source of IDs.
    return top
      .map((hit, i) => {
        const prefix = top.length > 1 ? `[${i + 1}] ` : '';
        const isRoute = hit.metadata?.source === 'triage-route';
        if (isRoute) {
          const id = hit.metadata?.deploymentId || 'unknown';
          const name = hit.metadata?.originalName || id;
          return `${prefix}[Triage route — deploymentId: ${id} | name: ${name}]:\n${hit.text}`;
        }
        const filename = hit.metadata?.originalName || 'document';
        return `${prefix}[From ${filename}]:\n${hit.text}`;
      })
      .join('\n\n---\n\n');
  }

  getLastSearchResults() {
    return this.lastSearchResults;
  }

  getStats() {
    return {
      isLoaded: this.isLoaded,
      embeddingsPath: this.embeddingsPath,
      totalChunks: this.chunks.length,
      model: this.model,
    };
  }
}

module.exports = VectorRAG;
