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
import { deploy as runDeploy } from './index.js';

/**
 * Build the artifact for a saved deployment row.
 *
 * @param {string} deploymentId
 * @returns {Promise<{ deployment: Object, artifactPath: string }>}
 */
export async function buildArtifact(deploymentId) {
  const deployment = await DeploymentRepository.findById(deploymentId);
  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found`);
  }

  await DeploymentRepository.markBuilding(deploymentId);

  try {
    const config = deployment.config || {};
    const meta = config._modular || {};
    const enabledProtocols =
      meta.enabledProtocols || config.enabledProtocols || {};

    const result = await runDeploy({
      deploymentId,
      botName: deployment.botName,
      config,
      apiKey: deployment.apiKey,
      appointmentDestinations: config.appointmentDestinations || [],
      triageDestinations: config.triageRoutes || config.triageDestinations || [],
      enabledProtocols,
      embeddingStorageKey: deployment.embeddingStorageKey || null,
      embeddingModel: deployment.embeddingModel || null,
      embeddingChunkCount: deployment.embeddingChunkCount || null,
    });

    const updated = await DeploymentRepository.setBuildResult(deploymentId, {
      artifactPath: result.relativeArtifactPath || result.artifactPath,
    });

    return { deployment: updated, artifactPath: result.artifactPath };
  } catch (err) {
    await DeploymentRepository.setBuildFailed(deploymentId, err.message);
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
