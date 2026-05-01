import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { composeInstructions } from '@/lib/composer/composer';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { DocumentRepository } from '@/lib/db/repositories/documents';

export async function GET(_request, { params }) {
  const { id } = await params;
  const deployment = await DeploymentRepository.findById(id);
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const docs = await DocumentRepository.findByIds(deployment.documentIds || []);
  const documents = docs.map((d) => ({
    id: d.id,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
  }));

  return NextResponse.json({ deployment, documents });
}

/**
 * Update an existing deployment's config / documents. Writes only to SQLite.
 * If the new config differs from the previously-built one, the row's status
 * transitions to 'stale' (handled in the repository).
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const existing = await DeploymentRepository.findById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const {
      config,
      enabledProtocols,
      appointmentDestinations,
      triageDestinations,
      documentIds,
      ragMode,
      embeddings,
    } = body;

    const baseConfig = config || existing.config || {};
    const finalEnabledProtocols =
      enabledProtocols ||
      baseConfig._modular?.enabledProtocols ||
      baseConfig.enabledProtocols ||
      {};
    const finalAppointments =
      appointmentDestinations || baseConfig.appointmentDestinations || [];
    const finalTriage =
      triageDestinations || baseConfig.triageRoutes || baseConfig.triageDestinations || [];

    // Vector RAG: caller may flip mode or swap embeddings on edit. Fall
    // back to existing values when not supplied so we don't accidentally
    // wipe a perfectly good vector cartridge on a partial PATCH.
    const finalRagMode =
      ragMode || baseConfig._modular?.ragMode || existing.ragMode || 'keyword';
    const finalEmbeddings =
      embeddings !== undefined
        ? embeddings
        : baseConfig._modular?.embeddings ||
          (existing.embeddingStorageKey
            ? {
                storageKey: existing.embeddingStorageKey,
                model: existing.embeddingModel,
                chunkCount: existing.embeddingChunkCount,
              }
            : null);

    if (finalRagMode === 'vector' && !finalEmbeddings?.storageKey) {
      return NextResponse.json(
        { error: 'ragMode=vector requires embeddings.storageKey' },
        { status: 400 }
      );
    }

    const objective =
      baseConfig.objective || `Help users as ${baseConfig.config?.name || existing.botName}`;
    const instructions = await composeInstructions({
      objective,
      enabledProtocols: finalEnabledProtocols,
      protocolData: {
        formStructure: baseConfig.formStructure,
        appointments: finalAppointments,
        triage: finalTriage,
      },
    });

    const mergedConfig = {
      ...baseConfig,
      appointmentDestinations: finalAppointments,
      triageRoutes: finalTriage,
      _modular: {
        paradigm: 'modular',
        enabledProtocols: finalEnabledProtocols,
        ragMode: finalRagMode,
        embeddings: finalRagMode === 'vector' ? finalEmbeddings : null,
      },
      _composedInstructions: instructions,
    };

    const updated = await DeploymentRepository.update(id, {
      config: mergedConfig,
      documentIds: documentIds ?? existing.documentIds,
      botName: baseConfig.config?.name
        ? baseConfig.config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40)
        : existing.botName,
    });

    // Stamp the discrete columns whether ragMode flipped or not — the build
    // pipeline reads from these, not from the config blob.
    await DeploymentRepository.setRagMode(updated.id, finalRagMode);
    if (finalRagMode === 'vector' && finalEmbeddings?.storageKey) {
      await DeploymentRepository.setEmbeddings(updated.id, {
        storageKey: finalEmbeddings.storageKey,
        model: finalEmbeddings.model,
        chunkCount: finalEmbeddings.chunkCount,
      });
    } else {
      await DeploymentRepository.clearEmbeddings(updated.id);
    }

    return NextResponse.json({
      deploymentId: updated.id,
      botName: updated.botName,
      status: updated.status,
      configHash: updated.configHash,
      lastBuiltHash: updated.lastBuiltHash,
      ragMode: finalRagMode,
      buildUrl: `/api/deployments/${updated.id}/build`,
      downloadUrl: `/api/deployments/${updated.id}/download`,
    });
  } catch (err) {
    console.error('[deployments:PATCH]', err);
    return NextResponse.json(
      { error: err.message || 'Update failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const deployment = await DeploymentRepository.findById(id);
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (deployment.artifactPath) {
    const artifactAbs = path.isAbsolute(deployment.artifactPath)
      ? deployment.artifactPath
      : path.join(process.cwd(), deployment.artifactPath);
    try {
      await fs.unlink(artifactAbs);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[deployments] unlink failed', err.message);
    }
  }

  await DeploymentRepository.delete(id);
  return NextResponse.json({ ok: true });
}
