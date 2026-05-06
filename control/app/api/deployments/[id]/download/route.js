import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { buildArtifact, isArtifactFresh } from '@/lib/deployers/build';

const ARTIFACTS_DIR =
  process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'data', 'artifacts');

function withDocsZipPath(deployment) {
  return path.join(
    ARTIFACTS_DIR,
    `${deployment.botName}-${deployment.id}-with-docs.zip`
  );
}

export async function GET(request, { params }) {
  const { id } = await params;
  const url = new URL(request.url);
  const withDocs = url.searchParams.get('withDocs') === '1';

  let deployment = await DeploymentRepository.findById(id);
  if (!deployment) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Lazy-build the lean artifact if absent or out of sync. The download URL
  // is a build-on-demand contract.
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

  if (withDocs) {
    return serveWithDocs(deployment, id);
  }

  return serveLean(deployment);
}

async function serveLean(deployment) {
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

async function serveWithDocs(deployment, id) {
  const docsZipAbs = withDocsZipPath(deployment);
  const leanZipAbs = path.isAbsolute(deployment.artifactPath)
    ? deployment.artifactPath
    : path.join(process.cwd(), deployment.artifactPath);

  // Reuse the cached with-docs zip when its mtime is at least as new as the
  // lean zip's. Any rebuild of the lean artifact (which is the only thing
  // config_hash changes can trigger) invalidates the docs zip by mtime order.
  let needsBuild = true;
  try {
    const [docsStat, leanStat] = await Promise.all([
      fs.stat(docsZipAbs),
      fs.stat(leanZipAbs),
    ]);
    if (docsStat.mtimeMs >= leanStat.mtimeMs) {
      needsBuild = false;
    }
  } catch {
    needsBuild = true;
  }

  if (needsBuild) {
    try {
      await buildArtifact(id, { withDocs: true });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Build failed: ${err.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  try {
    const stat = await fs.stat(docsZipAbs);
    const stream = createReadStream(docsZipAbs);
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="${deployment.botName}-with-docs.zip"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Artifact missing: ${err.message}` }), {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
