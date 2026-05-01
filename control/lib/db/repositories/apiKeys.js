import { getDb } from '../index.js';
import { newId } from '../ids.js';

function rowToApiKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    encryptedKey: row.encrypted_key,
    isDefault: row.is_default === 1,
    createdAt: new Date(row.created_at),
  };
}

export const ApiKeyRepository = {
  async findByUserId(_userId) {
    // Single-user mode: ignore userId and return all keys
    const db = getDb();
    const rows = db.prepare('SELECT * FROM api_keys ORDER BY is_default DESC, created_at ASC').all();
    return rows.map(rowToApiKey);
  },

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
    return rowToApiKey(row);
  },

  async findDefault() {
    const db = getDb();
    const row = db.prepare('SELECT * FROM api_keys WHERE is_default = 1 LIMIT 1').get();
    return rowToApiKey(row);
  },

  async findByProvider(provider) {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM api_keys WHERE provider = ? ORDER BY is_default DESC, created_at ASC LIMIT 1')
      .get(provider);
    return rowToApiKey(row);
  },

  async create({ name, provider, encryptedKey, isDefault = false }) {
    const db = getDb();
    const id = newId('ak');
    const now = Date.now();

    if (isDefault) {
      db.prepare('UPDATE api_keys SET is_default = 0').run();
    }

    db.prepare(
      `INSERT INTO api_keys (id, name, provider, encrypted_key, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, name, provider, encryptedKey, isDefault ? 1 : 0, now);

    return this.findById(id);
  },

  async setDefault(id) {
    const db = getDb();
    db.prepare('UPDATE api_keys SET is_default = 0').run();
    db.prepare('UPDATE api_keys SET is_default = 1 WHERE id = ?').run(id);
    return this.findById(id);
  },

  async delete(id) {
    const db = getDb();
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  },
};
