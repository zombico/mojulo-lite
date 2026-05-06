#!/usr/bin/env node
/**
 * Sweep data/artifacts/ and delete:
 *  - ZIPs whose deployment_id isn't in the DB anymore
 *  - Staging dirs (any non-zip entry left behind by an old build)
 *
 * Run after the save/build decouple lands to clear the historical pile.
 *
 *   node scripts/cleanup-stale-artifacts.js [--dry-run]
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getDb } from '../lib/db/index.js';

const ARTIFACTS_DIR =
  process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'data', 'artifacts');

const dryRun = process.argv.includes('--dry-run');

function extractDeploymentId(name) {
  // Filenames: {botName}-dep_{uuid}.zip            (lean)
  //            {botName}-dep_{uuid}-with-docs.zip  (with-docs variant)
  // Directories: {botName}-dep_{uuid}              (staging)
  const match = name.match(/(dep_[0-9a-f-]{36})(?:-with-docs)?(?:\.zip)?$/i);
  return match ? match[1] : null;
}

function isWithDocsZip(name) {
  return /-with-docs\.zip$/i.test(name);
}

async function main() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    console.log(`No artifacts dir at ${ARTIFACTS_DIR}, nothing to do.`);
    return;
  }

  const db = getDb();
  const liveIds = new Set(
    db.prepare('SELECT id FROM deployments').all().map((r) => r.id)
  );
  const liveArtifactPaths = new Set(
    db
      .prepare("SELECT artifact_path FROM deployments WHERE artifact_path IS NOT NULL")
      .all()
      .map((r) => path.basename(r.artifact_path))
  );

  const entries = await fsp.readdir(ARTIFACTS_DIR, { withFileTypes: true });

  let removedCount = 0;
  let keptCount = 0;
  for (const entry of entries) {
    const fullPath = path.join(ARTIFACTS_DIR, entry.name);
    const deploymentId = extractDeploymentId(entry.name);
    const isReferenced = entry.isFile() && liveArtifactPaths.has(entry.name);
    const ownerExists = deploymentId && liveIds.has(deploymentId);

    let remove = false;
    let reason = '';
    if (entry.isDirectory()) {
      // Staging dir — never the source of truth, always disposable
      remove = true;
      reason = 'staging dir';
    } else if (!deploymentId) {
      remove = true;
      reason = 'no deployment id in filename';
    } else if (!ownerExists) {
      remove = true;
      reason = 'deployment row gone';
    } else if (isWithDocsZip(entry.name)) {
      // With-docs zips aren't tracked in the DB — owner-row existence is the
      // only signal we have. Keep when the deployment is alive.
    } else if (!isReferenced) {
      remove = true;
      reason = 'orphaned (row points elsewhere)';
    }

    if (remove) {
      console.log(`${dryRun ? '[dry] ' : ''}rm ${entry.name}  (${reason})`);
      if (!dryRun) {
        await fsp.rm(fullPath, { recursive: true, force: true });
      }
      removedCount++;
    } else {
      keptCount++;
    }
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}removed=${removedCount} kept=${keptCount}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
