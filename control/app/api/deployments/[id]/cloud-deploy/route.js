import { NextResponse } from 'next/server';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import {
  cloudDeploy,
  cloudDestroy,
  cloudGetStatus,
} from '@/lib/deployers/cloud-deploy';
import { CLOUD_PROVIDERS } from '@/lib/deployers';

/**
 * POST initiates a cloud deploy in the background. Returns 202 immediately;
 * the client polls GET on this same URL for progress + final URL.
 *
 * Body: { provider: 'fly', options?: { region, guest, volumeGb } }
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const existing = await DeploymentRepository.findById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const provider = body.provider || 'fly';
  if (!CLOUD_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 400 }
    );
  }

  // Fire-and-forget: errors are persisted to the deployment row by the
  // lifecycle wrapper, so the client polls GET to learn the outcome.
  cloudDeploy({
    deploymentId: id,
    provider,
    options: body.options || {},
  }).catch((err) => {
    console.error('[cloud-deploy:POST] background failure', err);
  });

  return NextResponse.json(
    {
      deploymentId: id,
      provider,
      status: 'deploying',
      pollUrl: `/api/deployments/${id}/cloud-deploy`,
    },
    { status: 202 }
  );
}

/**
 * GET returns the deployment's current cloud state + progress trail. Polled
 * by the cloud-deploy page while a deploy is in flight.
 *
 * Optional ?refresh=1 reaches out to the provider for live machine status
 * (otherwise we trust the DB).
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const deployment = await DeploymentRepository.findById(id);
  if (!deployment) {
    return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  let live = null;
  if (searchParams.get('refresh') === '1' && deployment.cloudAppName) {
    try {
      live = await cloudGetStatus({ deploymentId: id });
    } catch (err) {
      live = { error: err.message };
    }
  }

  return NextResponse.json({
    deploymentId: id,
    botName: deployment.botName,
    provider: deployment.cloudProvider,
    appName: deployment.cloudAppName,
    status: deployment.cloudStatus,
    url: deployment.cloudUrl,
    progress: deployment.cloudProgress || [],
    options: deployment.cloudOptions,
    error: deployment.cloudError,
    lastDeployedAt: deployment.cloudLastDeployedAt,
    machineId: deployment.cloudMachineId,
    volumeId: deployment.cloudVolumeId,
    live,
  });
}

/**
 * DELETE tears down the cloud app. Cascades to volume + IPs on Fly. Clears
 * cloud_* columns on the deployment row.
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  try {
    const result = await cloudDestroy({ deploymentId: id });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cloud-deploy:DELETE]', err);
    return NextResponse.json(
      { error: err.message || 'Destroy failed' },
      { status: 500 }
    );
  }
}
