import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { composeInstructions } from '@/lib/composer/composer';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import {
  resolveSavedApiKeyIntoConfig,
  redactApiKeysFromConfig,
  preserveExistingCredentials,
  configHasStoredApiKey,
} from '@/lib/resolve-api-key';

export async function GET(_request, { params }) {
  const { id } = await params;
  const deployment = await DeploymentRepository.findById(id);
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Builder-created bots store embeddings only on discrete columns; lift them
  // into _modular.embeddings so the wizard's edit-mode hydration finds them.
  if (
    !deployment.config?._modular?.embeddings &&
    deployment.embeddingStorageKey
  ) {
    deployment.config = {
      ...deployment.config,
      _modular: {
        ...(deployment.config?._modular || {}),
        embeddings: {
          storageKey: deployment.embeddingStorageKey,
          model: deployment.embeddingModel,
          chunkCount: deployment.embeddingChunkCount,
        },
      },
    };
  }

  const docs = await DocumentRepository.findByIds(deployment.documentIds || []);
  const documents = docs.map((d) => ({
    id: d.id,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
  }));

  // Strip provider credentials before responding — the wizard hydrates from
  // this and we don't want plaintext keys flowing back to the browser. The
  // build pipeline uses DeploymentRepository directly, so it is unaffected.
  // hasStoredApiKey is computed pre-redaction so the wizard can show
  // "existing key configured" in edit mode without surfacing the value.
  const hasStoredApiKey = configHasStoredApiKey(deployment.config);
  const safeDeployment = {
    ...deployment,
    config: redactApiKeysFromConfig(deployment.config),
    hasStoredApiKey,
  };

  return NextResponse.json({ deployment: safeDeployment, documents });
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
      opticalReadFields,
      documentIds,
      embeddings,
      apiKeyId = null,
    } = body;

    const baseConfig = config || existing.config || {};
    if (apiKeyId) {
      await resolveSavedApiKeyIntoConfig(baseConfig, apiKeyId);
    } else {
      // Edit mode hydrated from the redacted GET, so the wizard sends the
      // selected provider's credential fields blank unless the user pasted a
      // new value. Carry the existing creds forward in that case.
      preserveExistingCredentials(baseConfig, existing.config);
    }
    const finalEnabledProtocols =
      enabledProtocols ||
      baseConfig._modular?.enabledProtocols ||
      baseConfig.enabledProtocols ||
      {};
    const finalAppointments =
      appointmentDestinations || baseConfig.appointmentDestinations || [];
    const finalTriage =
      triageDestinations || baseConfig.triageRoutes || baseConfig.triageDestinations || [];
    const finalOpticalReadFields =
      opticalReadFields || baseConfig.opticalReadFields || [];

    // All bots run vector retrieval. Knowledge or triage protocols require
    // embeddings; bots with neither have no embeddings and RAG is disabled.
    const finalRagMode = 'vector';
    const wantsEmbeddings =
      finalEnabledProtocols.knowledge || finalEnabledProtocols.triage;
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

    if (wantsEmbeddings && !finalEmbeddings?.storageKey) {
      return NextResponse.json(
        { error: 'Knowledge or triage protocol requires embeddings.storageKey' },
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
        opticalRead: { fields: finalOpticalReadFields },
      },
    });

    const mergedConfig = {
      ...baseConfig,
      appointmentDestinations: finalAppointments,
      triageRoutes: finalTriage,
      opticalReadFields: finalOpticalReadFields,
      _modular: {
        paradigm: 'modular',
        enabledProtocols: finalEnabledProtocols,
        ragMode: finalRagMode,
        embeddings: finalEmbeddings || null,
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

    await DeploymentRepository.setRagMode(updated.id, finalRagMode);
    if (finalEmbeddings?.storageKey) {
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

    // The with-docs variant lives next to the lean zip with a deterministic
    // suffix; it isn't tracked in the row, so unlink by name.
    const dir = path.dirname(artifactAbs);
    const base = path.basename(artifactAbs, '.zip');
    const docsZipAbs = path.join(dir, `${base}-with-docs.zip`);
    try {
      await fs.unlink(docsZipAbs);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[deployments] unlink with-docs failed', err.message);
    }
  }

  await DeploymentRepository.delete(id);
  return NextResponse.json({ ok: true });
}
