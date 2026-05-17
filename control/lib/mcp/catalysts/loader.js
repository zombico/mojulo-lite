/**
 * Skill catalyst loader.
 *
 * Skill catalysts are curated workflow patterns shipped with the control
 * plane. They live as .md files in this directory and are exposed via the MCP
 * server so the user's Claude can pull one, read the bot's shape via existing
 * operate tools, and **catalyze** the synthesis of a concrete local skill into
 * the user's `.claude/skills/`.
 *
 * The "catalyst" framing is literal: each file enables one phase transition
 * from a vague user intent + a bot's shape + a destination MCP into a
 * structured skill artifact. The catalyst is not consumed (the file persists
 * and can catalyze again for the next bot) and does not appear in the
 * resulting skill — it's the nucleation point that lets the skill crystallize
 * out.
 *
 * Mojulo only ships the canonical library — there is no user-writable
 * catalyst directory. Custom or one-off patterns are Claude Code's
 * responsibility: a user wanting a bespoke workflow either lets Claude
 * synthesize from scratch or maintains their own catalyst-shaped markdown
 * locally.
 *
 * File format — JSON frontmatter between two `---` fences, then markdown body:
 *
 *   ---
 *   { "id": "...", "name": "...", ... }
 *   ---
 *
 *   # Body markdown the model reads at synthesis time.
 *
 * Frontmatter is JSON (not YAML) to keep the loader dep-free and the parse
 * unambiguous. The body is the value — it's the prompt Claude reads to write
 * the user's skill, so it carries the workflow reasoning, mapping intent, and
 * pitfalls.
 *
 * Validation faults are loader bugs (the library is curated, not user input)
 * — we throw with a clear file + field reference so a bad PR fails loudly.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALYST_DIR = dirname(fileURLToPath(import.meta.url));

const REQUIRED_FIELDS = ['id', 'name', 'summary'];
const FRONTMATTER_FENCE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

let _catalog = null;

function parseCatalystFile(filePath, raw) {
  const match = raw.match(FRONTMATTER_FENCE);
  if (!match) {
    throw new Error(
      `Catalyst ${filePath} is missing JSON frontmatter (expected '---' fences).`
    );
  }
  let meta;
  try {
    meta = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`Catalyst ${filePath} has invalid JSON frontmatter: ${err.message}`);
  }
  for (const field of REQUIRED_FIELDS) {
    if (!meta[field] || typeof meta[field] !== 'string') {
      throw new Error(`Catalyst ${filePath} is missing required string field '${field}'.`);
    }
  }
  const body = raw.slice(match[0].length).trim();
  if (!body) {
    throw new Error(`Catalyst ${filePath} has an empty body — the prose is the catalyst's value.`);
  }
  return {
    id: meta.id,
    name: meta.name,
    summary: meta.summary,
    version: meta.version ?? 1,
    category: meta.category || null,
    requires: meta.requires || {},
    parameters: Array.isArray(meta.parameters) ? meta.parameters : [],
    mcpTools: meta.mcpTools || {},
    body,
  };
}

function loadCatalog() {
  const files = readdirSync(CATALYST_DIR).filter((f) => f.endsWith('.md'));
  const catalysts = new Map();
  for (const file of files) {
    const filePath = join(CATALYST_DIR, file);
    const raw = readFileSync(filePath, 'utf8');
    const catalyst = parseCatalystFile(filePath, raw);
    if (catalysts.has(catalyst.id)) {
      throw new Error(
        `Catalyst id collision: '${catalyst.id}' is declared in both ${catalysts.get(catalyst.id)._file} and ${file}.`
      );
    }
    catalyst._file = file;
    catalysts.set(catalyst.id, catalyst);
  }
  return catalysts;
}

export function getCatalystCatalog() {
  if (!_catalog) _catalog = loadCatalog();
  return _catalog;
}

export function listCatalysts({ category } = {}) {
  const catalog = getCatalystCatalog();
  const out = [];
  for (const catalyst of catalog.values()) {
    if (category && catalyst.category !== category) continue;
    out.push({
      id: catalyst.id,
      name: catalyst.name,
      summary: catalyst.summary,
      category: catalyst.category,
      requires: catalyst.requires,
    });
  }
  return out;
}

export function getCatalyst(id) {
  const catalyst = getCatalystCatalog().get(id);
  if (!catalyst) return null;
  const { _file, ...rest } = catalyst;
  return rest;
}

// Test seam — let the test suite point at a fixture directory.
export function _resetCatalogForTests(catalog) {
  _catalog = catalog || null;
}

export { CATALYST_DIR as _CATALYST_DIR_FOR_TESTS, parseCatalystFile as _parseCatalystFileForTests };
