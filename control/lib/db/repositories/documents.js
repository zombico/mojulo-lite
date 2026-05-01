import { getDb } from '../index.js';
import { newId } from '../ids.js';

function rowToDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    parsedText: row.parsed_text,
    createdAt: new Date(row.created_at),
  };
}

export const DocumentRepository = {
  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    return rowToDocument(row);
  },

  async findByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`).all(...ids);
    return rows.map(rowToDocument);
  },

  // Kept for API parity with the builder stream code. In Lite there are no bot spaces,
  // so this always returns the full document list — the builder can see
  // everything the local user has uploaded.
  async findByBotSpaceId(_botSpaceId) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
    return rows.map(rowToDocument);
  },

  async create({ originalName, mimeType, sizeBytes, storagePath, parsedText = null }) {
    const db = getDb();
    const id = newId('doc');
    const now = Date.now();
    db.prepare(
      `INSERT INTO documents (id, original_name, mime_type, size_bytes, storage_path, parsed_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, originalName, mimeType, Number(sizeBytes) || 0, storagePath, parsedText, now);
    return this.findById(id);
  },

  async delete(id) {
    const db = getDb();
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  },
};
