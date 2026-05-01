import crypto from 'crypto';
import { getDb } from '../index.js';
import { newId } from '../ids.js';

export const DEPLOYMENT_STATUS = {
  SAVED: 'saved',
  BUILDING: 'building',
  READY: 'ready',
  STALE: 'stale',
  BUILD_FAILED: 'build_failed',
};

function rowToDeployment(row) {
  if (!row) return null;
  return {
    id: row.id,
    botName: row.bot_name,
    flowType: row.flow_type,
    status: row.status,
    config: row.config ? JSON.parse(row.config) : null,
    configHash: row.config_hash,
    lastBuiltHash: row.last_built_hash,
    artifactPath: row.artifact_path,
    documentIds: row.document_ids ? JSON.parse(row.document_ids) : [],
    apiKey: row.api_key,
    error: row.error,
    url: row.url || null,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : null,
    ragMode: row.rag_mode || 'keyword',
    embeddingStorageKey: row.embedding_storage_key || null,
    embeddingModel: row.embedding_model || null,
    embeddingChunkCount:
      row.embedding_chunk_count != null ? row.embedding_chunk_count : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = canonicalize(value[k]);
        return acc;
      }, {});
  }
  return value;
}

function hashConfig(config, documentIds = []) {
  const projection = {
    config: canonicalize(config || {}),
    documentIds: [...(documentIds || [])].sort(),
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(projection))
    .digest('hex');
}

export const DeploymentRepository = {
  hashConfig,

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    return rowToDeployment(row);
  },

  async findByIdAndUserId(id, _userId) {
    return this.findById(id);
  },

  async findByBotSpaceId(_botSpaceId) {
    return this.list();
  },

  async list() {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM deployments ORDER BY created_at DESC').all();
    return rows.map(rowToDeployment);
  },

  async create({
    botName,
    flowType = 'modular',
    status = DEPLOYMENT_STATUS.SAVED,
    config,
    apiKey,
    documentIds = [],
    artifactPath = null,
  }) {
    const db = getDb();
    const id = newId('dep');
    const now = Date.now();
    const configHash = hashConfig(config, documentIds);
    db.prepare(
      `INSERT INTO deployments (id, bot_name, flow_type, status, config, config_hash, last_built_hash, artifact_path, document_ids, api_key, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`
    ).run(
      id,
      botName,
      flowType,
      status,
      JSON.stringify(config || {}),
      configHash,
      artifactPath,
      JSON.stringify(documentIds),
      apiKey,
      now,
      now
    );
    return this.findById(id);
  },

  /**
   * Update a deployment row. Recomputes config_hash from the merged config +
   * documentIds. If the hash changed and a build already exists, transitions
   * status to 'stale' (unless the caller passes an explicit status).
   */
  async update(id, changes) {
    const db = getDb();
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged = {
      botName: changes.botName ?? existing.botName,
      config: changes.config ?? existing.config,
      artifactPath:
        changes.artifactPath !== undefined ? changes.artifactPath : existing.artifactPath,
      documentIds: changes.documentIds ?? existing.documentIds,
      error: changes.error !== undefined ? changes.error : existing.error,
      lastBuiltHash:
        changes.lastBuiltHash !== undefined ? changes.lastBuiltHash : existing.lastBuiltHash,
    };

    const newHash = hashConfig(merged.config, merged.documentIds);
    const hashChanged = newHash !== existing.configHash;

    let nextStatus = changes.status ?? existing.status;
    if (
      changes.status === undefined &&
      hashChanged &&
      (existing.status === DEPLOYMENT_STATUS.READY ||
        existing.status === DEPLOYMENT_STATUS.BUILD_FAILED)
    ) {
      nextStatus = DEPLOYMENT_STATUS.STALE;
    }

    db.prepare(
      `UPDATE deployments
       SET bot_name = ?, status = ?, config = ?, config_hash = ?, last_built_hash = ?, artifact_path = ?, document_ids = ?, error = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      merged.botName,
      nextStatus,
      JSON.stringify(merged.config || {}),
      newHash,
      merged.lastBuiltHash,
      merged.artifactPath,
      JSON.stringify(merged.documentIds || []),
      merged.error,
      Date.now(),
      id
    );
    return this.findById(id);
  },

  /**
   * Persist the result of a successful build: stamp last_built_hash to the
   * current config_hash, store the artifact path, set status to 'ready'.
   */
  async setBuildResult(id, { artifactPath }) {
    const db = getDb();
    const existing = await this.findById(id);
    if (!existing) return null;
    db.prepare(
      `UPDATE deployments
       SET status = ?, artifact_path = ?, last_built_hash = ?, error = NULL, updated_at = ?
       WHERE id = ?`
    ).run(
      DEPLOYMENT_STATUS.READY,
      artifactPath,
      existing.configHash,
      Date.now(),
      id
    );
    return this.findById(id);
  },

  async setBuildFailed(id, errorMessage) {
    const db = getDb();
    db.prepare(
      `UPDATE deployments
       SET status = ?, error = ?, updated_at = ?
       WHERE id = ?`
    ).run(DEPLOYMENT_STATUS.BUILD_FAILED, errorMessage || 'Build failed', Date.now(), id);
    return this.findById(id);
  },

  async markBuilding(id) {
    const db = getDb();
    db.prepare(
      `UPDATE deployments
       SET status = ?, error = NULL, updated_at = ?
       WHERE id = ?`
    ).run(DEPLOYMENT_STATUS.BUILDING, Date.now(), id);
    return this.findById(id);
  },

  async delete(id) {
    const db = getDb();
    db.prepare('DELETE FROM deployments WHERE id = ?').run(id);
  },

  async setUrl(id, url) {
    const db = getDb();
    const now = Date.now();
    db.prepare(
      `UPDATE deployments SET url = ?, last_seen_at = ?, updated_at = ? WHERE id = ?`
    ).run(url, now, now, id);
    return this.findById(id);
  },

  async clearUrl(id) {
    const db = getDb();
    db.prepare(
      `UPDATE deployments SET url = NULL, last_seen_at = NULL, updated_at = ? WHERE id = ?`
    ).run(Date.now(), id);
    return this.findById(id);
  },

  async touchLastSeen(id) {
    const db = getDb();
    db.prepare(`UPDATE deployments SET last_seen_at = ? WHERE id = ?`).run(Date.now(), id);
  },

  async setEmbeddings(id, { storageKey, model, chunkCount }) {
    const db = getDb();
    db.prepare(
      `UPDATE deployments
       SET embedding_storage_key = ?, embedding_model = ?, embedding_chunk_count = ?, updated_at = ?
       WHERE id = ?`
    ).run(storageKey, model, chunkCount, Date.now(), id);
    return this.findById(id);
  },

  async clearEmbeddings(id) {
    const db = getDb();
    db.prepare(
      `UPDATE deployments
       SET embedding_storage_key = NULL, embedding_model = NULL, embedding_chunk_count = NULL, updated_at = ?
       WHERE id = ?`
    ).run(Date.now(), id);
    return this.findById(id);
  },

  async setRagMode(id, mode) {
    if (mode !== 'keyword' && mode !== 'vector') {
      throw new Error(`Invalid rag mode: ${mode}`);
    }
    const db = getDb();
    db.prepare(
      `UPDATE deployments SET rag_mode = ?, updated_at = ? WHERE id = ?`
    ).run(mode, Date.now(), id);
    return this.findById(id);
  },
};
