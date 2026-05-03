import { DockerDeployer } from './docker.js';
import { FlyDeployer } from './fly.js';

let _deployer = null;

export async function getDeploymentProvider() {
  if (!_deployer) _deployer = new DockerDeployer();
  return _deployer;
}

export async function deploy(params) {
  const provider = await getDeploymentProvider();
  return provider.deploy(params);
}

export async function destroy(appId) {
  const provider = await getDeploymentProvider();
  return provider.destroy(appId);
}

/**
 * Construct a cloud deployer instance per-call. Cloud deployers are
 * stateless aside from credentials, so there's no caching layer — the
 * caller passes the user's token in.
 *
 * Currently registered: 'fly'. Add new providers here.
 */
export function getCloudDeployer(provider, credentials = {}) {
  if (provider === 'fly') {
    return new FlyDeployer({
      apiToken: credentials.flyApiToken || process.env.FLY_API_TOKEN,
      orgSlug: credentials.flyOrgSlug || process.env.FLY_ORG_SLUG || 'personal',
    });
  }
  throw new Error(`Unknown cloud provider: ${provider}`);
}

export const CLOUD_PROVIDERS = ['fly'];
