import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { buildArtifact, isArtifactFresh } from '@/lib/deployers/build';

export async function GET(_request, { params }) {
  const { id } = await params;
  let deployment = await DeploymentRepository.findById(id);
  if (!deployment) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Lazy-build if no artifact yet, or the stored one is out of sync with the
  // current config hash (status === 'stale'). The download URL is a
  // build-on-demand contract.
  if (!isArtifactFresh(deployment)) {
    try {
      const { deployment: rebuilt } = await buildArtifact(id);
      deployment = rebuilt;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Build failed: ${err.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const artifactAbs = path.isAbsolute(deployment.artifactPath)
    ? deployment.artifactPath
    : path.join(process.cwd(), deployment.artifactPath);

  try {
    const stat = await fs.stat(artifactAbs);
    const stream = createReadStream(artifactAbs);
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="${deployment.botName}.zip"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Artifact missing: ${err.message}` }), {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
