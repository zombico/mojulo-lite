import { getDb } from '../index.js';
import { newId } from '../ids.js';

export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
};

const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    tool: row.tool,
    status: row.status,
    progress: row.progress != null ? row.progress : null,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error || null,
    mcpSessionId: row.mcp_session_id || null,
    builderSessionId: row.builder_session_id || null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const McpJobRepository = {
  async create({ tool, mcpSessionId = null, builderSessionId = null }) {
    const db = getDb();
    const id = newId('mcpjob');
    const now = Date.now();
    db.prepare(
      `INSERT INTO mcp_jobs (id, tool, status, progress, result, error, mcp_session_id, builder_session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
    ).run(id, tool, JOB_STATUS.PENDING, 0, mcpSessionId, builderSessionId, now, now);
    // Drop old rows opportunistically — keeps the table bounded without a cron.
    db.prepare('DELETE FROM mcp_jobs WHERE created_at < ?').run(now - JOB_TTL_MS);
    return this.findById(id);
  },

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM mcp_jobs WHERE id = ?').get(id);
    return rowToJob(row);
  },

  async setRunning(id) {
    const db = getDb();
    db.prepare(
      'UPDATE mcp_jobs SET status = ?, updated_at = ? WHERE id = ?'
    ).run(JOB_STATUS.RUNNING, Date.now(), id);
    return this.findById(id);
  },

  async setProgress(id, progress) {
    const db = getDb();
    const clamped = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
    db.prepare('UPDATE mcp_jobs SET progress = ?, updated_at = ? WHERE id = ?').run(
      clamped,
      Date.now(),
      id
    );
    return this.findById(id);
  },

  async setDone(id, result) {
    const db = getDb();
    db.prepare(
      'UPDATE mcp_jobs SET status = ?, progress = ?, result = ?, error = NULL, updated_at = ? WHERE id = ?'
    ).run(JOB_STATUS.DONE, 100, JSON.stringify(result ?? null), Date.now(), id);
    return this.findById(id);
  },

  async setError(id, error) {
    const db = getDb();
    const msg = error?.message || String(error || 'Unknown error');
    db.prepare(
      'UPDATE mcp_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?'
    ).run(JOB_STATUS.ERROR, msg, Date.now(), id);
    return this.findById(id);
  },
};
