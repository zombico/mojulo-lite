#!/usr/bin/env node
// Compute a leaf-level diff between en.json at <ref> and en.json in the working
// tree. Used by the /sync-locales skill to figure out which keys each translated
// locale must add, update, or remove.
//
// Output is JSON on stdout:
//   { ref, added: [{path,value}], modified: [{path,before,after}], removed: [{path,before}] }
// `path` is an array of keys from the root of the messages object to the leaf.
//
// Usage: node scripts/diff-locale.mjs [<ref>]
//   default ref: HEAD

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = resolve(__dirname, '..', 'messages');
const enPath = resolve(messagesDir, 'en.json');
const repoRoot = resolve(__dirname, '..', '..');

const ref = process.argv[2] || 'HEAD';

let before;
try {
  const raw = execSync(`git show ${ref}:control/messages/en.json`, {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString();
  before = JSON.parse(raw);
} catch (e) {
  console.error(`failed to read en.json at ${ref}: ${e.message}`);
  process.exit(1);
}

let after;
try {
  after = JSON.parse(readFileSync(enPath, 'utf8'));
} catch (e) {
  console.error(`failed to parse working-tree en.json: ${e.message}`);
  process.exit(1);
}

const added = [];
const modified = [];
const removed = [];

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function walk(b, a, path) {
  if (isObj(b) || isObj(a)) {
    const bObj = isObj(b) ? b : {};
    const aObj = isObj(a) ? a : {};
    const keys = new Set([...Object.keys(bObj), ...Object.keys(aObj)]);
    for (const k of keys) walk(bObj[k], aObj[k], [...path, k]);
    return;
  }
  if (b === undefined && a !== undefined) {
    added.push({ path, value: a });
  } else if (a === undefined && b !== undefined) {
    removed.push({ path, before: b });
  } else if (JSON.stringify(b) !== JSON.stringify(a)) {
    modified.push({ path, before: b, after: a });
  }
}

walk(before, after, []);

process.stdout.write(JSON.stringify({ ref, added, modified, removed }, null, 2) + '\n');
