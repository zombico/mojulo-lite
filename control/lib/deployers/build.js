/**
 * Artifact build orchestration.
 *
 * Wraps the pure DockerDeployer with the DB row lifecycle:
 *   markBuilding → DockerDeployer.deploy → setBuildResult / setBuildFailed.
 *
 * Used by /api/deployments/[id]/build and the lazy-build path in
 * /api/deployments/[id]/download.
 */

import { DeploymentRepository, DEPLOYMENT_STATUS } from '../db/repositories/deployments.js';
import { DocumentRepository } from '../db/repositories/documents.js';
import { deploy as runDeploy } from './index.js';

/**
 * Build the artifact for a saved deployment row.
 *
 * The lean build (`withDocs=false`) is the canonical artifact tracked on the
 * deployment row via `artifact_path` and `last_built_hash`. The with-docs
 * variant is built on demand and lives at a sibling zip path; it intentionally
 * does NOT update the row, so the lean cache is never displaced.
 *
 * @param {string} deploymentId
 * @param {Object} [options]
 * @param {boolean} [options.withDocs=false]
 * @returns {Promise<{ deployment: Object, artifactPath: string }>}
 */
export async function buildArtifact(deploymentId, { withDocs = false } = {}) {
  const deployment = await DeploymentRepository.findById(deploymentId);
  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found`);
  }

  if (!withDocs) {
    await DeploymentRepository.markBuilding(deploymentId);
  }

  try {
    const config = deployment.config || {};
    const meta = config._modular || {};
    const enabledProtocols =
      meta.enabledProtocols || config.enabledProtocols || {};

    const documents = withDocs && deployment.documentIds?.length
      ? await DocumentRepository.findByIds(deployment.documentIds)
      : [];

    const result = await runDeploy({
      deploymentId,
      botName: deployment.botName,
      config,
      apiKey: deployment.apiKey,
      appointmentDestinations: config.appointmentDestinations || [],
      triageDestinations: config.triageRoutes || config.triageDestinations || [],
      opticalReadFields: config.opticalReadFields || [],
      enabledProtocols,
      embeddingStorageKey: deployment.embeddingStorageKey || null,
      embeddingModel: deployment.embeddingModel || null,
      embeddingChunkCount: deployment.embeddingChunkCount || null,
      withDocs,
      documents,
    });

    if (withDocs) {
      return { deployment, artifactPath: result.artifactPath };
    }

    const updated = await DeploymentRepository.setBuildResult(deploymentId, {
      artifactPath: result.relativeArtifactPath || result.artifactPath,
    });

    return { deployment: updated, artifactPath: result.artifactPath };
  } catch (err) {
    if (!withDocs) {
      await DeploymentRepository.setBuildFailed(deploymentId, err.message);
    }
    throw err;
  }
}

/**
 * True if the deployment's stored artifact matches its current config_hash.
 */
export function isArtifactFresh(deployment) {
  if (!deployment) return false;
  if (!deployment.artifactPath) return false;
  if (deployment.status !== DEPLOYMENT_STATUS.READY) return false;
  return deployment.lastBuiltHash === deployment.configHash;
}
