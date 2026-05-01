import { DockerDeployer } from './docker.js';

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
