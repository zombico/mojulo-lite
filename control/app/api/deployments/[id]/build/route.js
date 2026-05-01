import { NextResponse } from 'next/server';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { buildArtifact, isArtifactFresh } from '@/lib/deployers/build';

/**
 * Produce the ZIP for an existing deployment row. Idempotent — if the row's
 * config_hash matches its last_built_hash, no rebuild happens.
 *
 * Body: { force?: boolean } — pass `force: true` to rebuild even if fresh.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const existing = await DeploymentRepository.findById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let force = false;
  try {
    const body = await request.json();
    force = !!body?.force;
  } catch {}

  if (!force && isArtifactFresh(existing)) {
    return NextResponse.json({
      deploymentId: existing.id,
      status: existing.status,
      artifactPath: existing.artifactPath,
      downloadUrl: `/api/deployments/${existing.id}/download`,
      cached: true,
    });
  }

  try {
    const { deployment } = await buildArtifact(id);
    return NextResponse.json({
      deploymentId: deployment.id,
      status: deployment.status,
      artifactPath: deployment.artifactPath,
      downloadUrl: `/api/deployments/${deployment.id}/download`,
      cached: false,
    });
  } catch (err) {
    console.error('[deployments:build]', err);
    return NextResponse.json(
      { error: err.message || 'Build failed' },
      { status: 500 }
    );
  }
}
