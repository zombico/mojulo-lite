/**
 * ESM resolver hook that maps `@/...` imports to the control directory so the
 * stdio MCP entry can run under plain Node (Next.js handles `@/` natively via
 * jsconfig.json, but Node does not).
 *
 * Registered by [mcp-stdio.mjs](./mcp-stdio.mjs) via `module.register`. Hooks
 * run in a worker thread and fire for every subsequent dynamic import — the
 * stdio entry's `await import('@/lib/mcp/server')` is resolved here.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, statSync } from 'node:fs';

const CONTROL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXTS = ['', '.js', '.mjs', '.cjs', '.json'];

function resolveAlias(specifier) {
  const base = path.join(CONTROL_DIR, specifier.slice(2));
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of ['.js', '.mjs']) {
      const indexFile = path.join(base, `index${ext}`);
      if (existsSync(indexFile)) return indexFile;
    }
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = resolveAlias(specifier);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }
  return nextResolve(specifier, context);
}
