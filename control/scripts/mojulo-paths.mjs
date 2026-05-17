/**
 * Resolve the mojulo home / data / models directories and seed the env vars
 * the rest of the control plane reads.
 *
 * Layered defaults:
 *   MOJULO_HOME       (default: ~/.mojulo)
 *   MOJULO_DATA_DIR   (default: $MOJULO_HOME/data)
 *   MOJULO_MODELS_DIR (default: $MOJULO_HOME/models)
 *
 * From those, sets — without overriding — the lower-level env vars the lib
 * code already honors:
 *   SQLITE_PATH    → $MOJULO_DATA_DIR/mojulo-lite.db
 *   ARTIFACTS_DIR  → $MOJULO_DATA_DIR/artifacts
 *   STORAGE_ROOT   → $MOJULO_DATA_DIR/storage
 *
 * Shared by [mcp-stdio.mjs](./mcp-stdio.mjs) and [mcp-config.mjs](./mcp-config.mjs)
 * so a fresh `~/.mojulo/` works for both stdio and the config CLI.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export function resolveMojuloPaths() {
  const home = process.env.MOJULO_HOME || path.join(os.homedir(), '.mojulo');
  const dataDir = process.env.MOJULO_DATA_DIR || path.join(home, 'data');
  const modelsDir = process.env.MOJULO_MODELS_DIR || path.join(home, 'models');

  process.env.MOJULO_HOME ??= home;
  process.env.MOJULO_DATA_DIR ??= dataDir;
  process.env.MOJULO_MODELS_DIR ??= modelsDir;
  process.env.SQLITE_PATH ??= path.join(dataDir, 'mojulo-lite.db');
  process.env.ARTIFACTS_DIR ??= path.join(dataDir, 'artifacts');
  process.env.STORAGE_ROOT ??= path.join(dataDir, 'storage');

  for (const dir of [home, dataDir, modelsDir, process.env.ARTIFACTS_DIR, process.env.STORAGE_ROOT]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    home,
    dataDir,
    modelsDir,
    dbPath: process.env.SQLITE_PATH,
    artifactsDir: process.env.ARTIFACTS_DIR,
    storageRoot: process.env.STORAGE_ROOT,
  };
}
