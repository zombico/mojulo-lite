/**
 * Cloud deploy orchestration.
 *
 * Wraps a provider deployer (FlyDeployer initially) with the deployment
 * row's cloud-state lifecycle:
 *   startCloudDeploy → onProgress → finishCloudDeploy / failCloudDeploy.
 *
 * The lifecycle is deliberately parallel to build.js — that wrapper covers
 * the local-artifact path (markBuilding → setBuildResult / setBuildFailed),
 * this one covers the cloud path. The two are independent: a deployment
 * can have a fresh local ZIP and no cloud deploy, or vice versa.
 *
 * Cloud deploy still calls buildArtifact() first, because the staged
 * config files it produces are exactly what the cloud deployer injects
 * into the container via the platform's file API. No code in docker.js or
 * the composer needs to change.
 */

import fsp from 'fs/promises';
import path from 'path';
import {
  DeploymentRepository,
  CLOUD_STATUS,
} from '../db/repositories/deployments.js';
import { ApiKeyRepository } from '../db/repositories/apiKeys.js';
import { decryptApiKey } from '../deployment-auth.js';
import { buildArtifact, isArtifactFresh } from './build.js';
import { FlyDeployer } from './fly.js';

const ARTIFACTS_DIR =
  process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'data', 'artifacts');

/**
 * Recursively walk a directory and return [{ relativePath, contents }] for
 * every regular file. Used to harvest the staged config + documents for
 * file-injection into the cloud container.
 */
async function readDirRecursive(rootDir) {
  const out = [];
  async function walk(dir, prefix) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        const buf = await fsp.readFile(full);
        out.push({ relativePath: rel, contents: buf });
      }
    }
  }
  await walk(rootDir, '');
  return out;
}

/**
 * Read the staged config + documents for a deployment, formatted for the
 * provider's file-injection API. Maps host paths → container paths:
 *   <staging>/config/X.json     → /app/config/X.json
 *   <staging>/documents/Y.txt   → /app/documents/Y.txt
 */
async function harvestConfigFiles(deployment) {
  const stagingDir = path.join(
    ARTIFACTS_DIR,
    `${deployment.botName}-${deployment.id}`
  );
  const out = [];

  const configFiles = await readDirRecursive(path.join(stagingDir, 'config'));
  for (const f of configFiles) {
    out.push({ guestPath: `/app/config/${f.relativePath}`, contents: f.contents });
  }

  const docFiles = await readDirRecursive(path.join(stagingDir, 'documents'));
  for (const f of docFiles) {
    out.push({
      guestPath: `/app/documents/${f.relativePath}`,
      contents: f.contents,
    });
  }

  return out;
}

/**
 * Resolve the LLM API key env var for the bot's selected provider, sourced
 * from the encrypted api_keys store — the same key the operator already
 * configured (and that the local-artifact path uses to build/run the bot).
 *
 * Bedrock is a special case: its encrypted_key holds a JSON blob
 * ({ region, accessKeyId, secretAccessKey }) which expands into the three
 * standard AWS env vars on the container.
 */
async function resolveLlmEnv(deployment) {
  const provider = deployment.config?.llm?.provider || 'anthropic';
  const env = { LLM_PROVIDER: provider };

  const record = await ApiKeyRepository.findByProvider(provider);
  if (!record) {
    throw new Error(
      `No saved API key for provider "${provider}". Add one in Settings → API keys before deploying.`
    );
  }

  let plaintext;
  try {
    plaintext = decryptApiKey(record.encryptedKey);
  } catch (err) {
    throw new Error(
      `Failed to decrypt the saved "${provider}" API key. ` +
        `If API_KEY_ENCRYPTION_KEY changed, re-save the key in Settings. (${err.message})`
    );
  }

  if (provider === 'bedrock') {
    let creds;
    try {
      creds = JSON.parse(plaintext);
    } catch {
      throw new Error(
        'Saved Bedrock credentials are not valid JSON. Reconfigure them in Settings.'
      );
    }
    env.AWS_REGION = creds.region || 'us-east-1';
    env.AWS_ACCESS_KEY_ID = creds.accessKeyId || '';
    env.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey || '';
    return env;
  }

  const envVarByProvider = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
  };
  const envName = envVarByProvider[provider];
  if (!envName) {
    throw new Error(`Unsupported provider for cloud deploy: "${provider}"`);
  }
  env[envName] = plaintext;
  return env;
}

/**
 * Build a provider deployer instance, sourcing credentials from the
 * encrypted api_keys store (Settings → Provider Keys). FLY_ORG_SLUG can
 * still be set via env for the rare non-personal-org case; the secret
 * token never lives in env.
 */
async function buildProviderDeployer(provider) {
  if (provider === 'fly') {
    const record = await ApiKeyRepository.findByProvider('fly');
    if (!record) {
      throw new Error(
        'Fly deploy requires a saved Fly.io token. Add one in Settings → Provider Keys.'
      );
    }
    let apiToken;
    try {
      apiToken = decryptApiKey(record.encryptedKey);
    } catch (err) {
      throw new Error(
        'Failed to decrypt the saved Fly.io token. ' +
          `If API_KEY_ENCRYPTION_KEY changed, re-save the key in Settings. (${err.message})`
      );
    }
    return new FlyDeployer({
      apiToken,
      orgSlug: process.env.FLY_ORG_SLUG || 'personal',
    });
  }
  throw new Error(`Unknown cloud provider: ${provider}`);
}

/**
 * Cloud-deploy a saved deployment row. Idempotent against an existing
 * cloud app: redeploying with the same inputs updates the existing
 * machine + reattaches the existing volume.
 *
 * @param {Object} args
 * @param {string} args.deploymentId
 * @param {string} args.provider          'fly' (only one for now)
 * @param {Object} [args.options]         { region, guest: { cpus, memory_mb }, volumeGb }
 * @param {string} [args.userId]          Used to derive the deterministic app name
 */
export async function cloudDeploy({
  deploymentId,
  provider = 'fly',
  options = {},
  userId = 'local',
}) {
  const deployment = await DeploymentRepository.findById(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  // Build (or reuse) the local artifact first — its staged config files are
  // what the cloud deployer injects.
  if (!isArtifactFresh(deployment)) {
    await buildArtifact(deploymentId);
  }
  const refreshed = await DeploymentRepository.findById(deploymentId);

  const flyAppName = FlyDeployer.computeAppName({
    userId,
    botName: refreshed.botName,
  });
  const appName = options.appName || flyAppName;

  await DeploymentRepository.startCloudDeploy(deploymentId, {
    provider,
    appName,
    options,
  });

  try {
    const configFiles = await harvestConfigFiles(refreshed);
    const llmEnv = await resolveLlmEnv(refreshed);
    const env = {
      ...llmEnv,
      MOJULO_API_KEY: refreshed.apiKey,
    };

    const deployer = await buildProviderDeployer(provider);

    const result = await deployer.deploy({
      appName,
      configFiles,
      env,
      region: options.region,
      guest: options.guest,
      volumeGb: options.volumeGb,
      onProgress: async ({ step, message }) => {
        try {
          await DeploymentRepository.appendCloudProgress(deploymentId, {
            step,
            message,
          });
        } catch (err) {
          console.error('[cloud-deploy:progress]', err);
        }
      },
    });

    const updated = await DeploymentRepository.finishCloudDeploy(deploymentId, {
      url: result.url,
      machineId: result.machineId,
      volumeId: result.volumeId,
    });
    return { deployment: updated, ...result };
  } catch (err) {
    console.error('[cloud-deploy]', err);
    await DeploymentRepository.appendCloudProgress(deploymentId, {
      step: 'error',
      message: err.message || String(err),
    }).catch(() => {});
    await DeploymentRepository.failCloudDeploy(deploymentId, err.message || String(err));
    throw err;
  }
}

export async function cloudDestroy({ deploymentId }) {
  const deployment = await DeploymentRepository.findById(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);
  if (!deployment.cloudProvider || !deployment.cloudAppName) {
    return { ok: true, alreadyDestroyed: true };
  }

  const deployer = await buildProviderDeployer(deployment.cloudProvider);
  await deployer.destroy(deployment.cloudAppName);
  await DeploymentRepository.clearCloudDeploy(deploymentId);
  return { ok: true };
}

export async function cloudPause({ deploymentId }) {
  const deployment = await DeploymentRepository.findById(deploymentId);
  if (!deployment?.cloudAppName || !deployment.cloudProvider) {
    throw new Error('No active cloud deploy to pause');
  }
  const deployer = await buildProviderDeployer(deployment.cloudProvider);
  await deployer.pause(deployment.cloudAppName);
  await DeploymentRepository.setCloudStatus(deploymentId, CLOUD_STATUS.PAUSED);
  return { ok: true };
}

export async function cloudResume({ deploymentId }) {
  const deployment = await DeploymentRepository.findById(deploymentId);
  if (!deployment?.cloudAppName || !deployment.cloudProvider) {
    throw new Error('No cloud deploy to resume');
  }
  const deployer = await buildProviderDeployer(deployment.cloudProvider);
  await deployer.resume(deployment.cloudAppName);
  await DeploymentRepository.setCloudStatus(deploymentId, CLOUD_STATUS.RUNNING);
  return { ok: true };
}

export async function cloudGetStatus({ deploymentId }) {
  const deployment = await DeploymentRepository.findById(deploymentId);
  if (!deployment?.cloudAppName || !deployment.cloudProvider) {
    return { status: 'not_deployed' };
  }
  const deployer = await buildProviderDeployer(deployment.cloudProvider);
  return deployer.getStatus(deployment.cloudAppName);
}
