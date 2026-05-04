import { NextResponse } from 'next/server';
import { composeInstructions } from '@/lib/composer/composer';
import { DeploymentRepository, DEPLOYMENT_STATUS } from '@/lib/db/repositories/deployments';
import { generateApiKey } from '@/lib/deployment-auth';

function sanitizeBotName(name) {
  return (name || 'bot')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'bot';
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const botName = searchParams.get('botName');
  let deployments = await DeploymentRepository.list();
  if (botName) {
    deployments = deployments.filter((d) => d.botName === botName);
  }
  return NextResponse.json({
    deployments: deployments.map((d) => ({
      id: d.id,
      botName: d.botName,
      flowType: d.flowType,
      status: d.status,
      artifactPath: d.artifactPath,
      configHash: d.configHash,
      lastBuiltHash: d.lastBuiltHash,
      error: d.error,
      url: d.url,
      lastSeenAt: d.lastSeenAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      enabledProtocols: d.config?._modular?.enabledProtocols || d.config?.enabledProtocols,
    })),
  });
}

/**
 * Save a new deployment config. Writes only to SQLite — no artifact build.
 * To produce a ZIP, call POST /api/deployments/[id]/build afterward (or hit
 * the download endpoint, which lazy-builds on demand).
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      botName: rawBotName,
      config,
      enabledProtocols = {},
      appointmentDestinations = [],
      triageDestinations = [],
      documentIds = [],
      flowType = 'modular',
      embeddings = null,
    } = body;

    // All bots run vector retrieval. Knowledge or triage protocols require
    // embeddings (docs and route descriptions go into a single cosine index);
    // bots with neither simply have no embeddings and RAG is disabled at
    // runtime.
    const ragMode = 'vector';
    const wantsEmbeddings = enabledProtocols.knowledge || enabledProtocols.triage;

    if (wantsEmbeddings && !embeddings?.storageKey) {
      return NextResponse.json(
        { error: 'Knowledge or triage protocol requires embeddings.storageKey from /api/vectorize-rag' },
        { status: 400 }
      );
    }

    const nameFromPayload = rawBotName || config?.config?.name;
    if (!nameFromPayload) {
      return NextResponse.json(
        { error: 'botName or config.config.name is required' },
        { status: 400 }
      );
    }

    const botName = sanitizeBotName(nameFromPayload);
    const apiKey = generateApiKey();

    const objective = config.objective || `Help users as ${config.config?.name || botName}`;
    const instructions = await composeInstructions({
      objective,
      enabledProtocols,
      protocolData: {
        formStructure: config.formStructure,
        appointments: appointmentDestinations,
        triage: triageDestinations,
      },
    });

    const deployment = await DeploymentRepository.create({
      botName,
      flowType,
      status: DEPLOYMENT_STATUS.SAVED,
      config: {
        ...config,
        appointmentDestinations,
        triageRoutes: triageDestinations,
        _modular: {
          paradigm: 'modular',
          enabledProtocols,
          // Mirror the vector RAG state into the config blob so edit-mode
          // hydration round-trips it without an extra DB hop.
          ragMode,
          embeddings: embeddings || null,
        },
        _composedInstructions: instructions,
      },
      apiKey,
      documentIds,
    });

    // Stamp the discrete columns the build pipeline reads.
    await DeploymentRepository.setRagMode(deployment.id, ragMode);
    if (embeddings?.storageKey) {
      await DeploymentRepository.setEmbeddings(deployment.id, {
        storageKey: embeddings.storageKey,
        model: embeddings.model,
        chunkCount: embeddings.chunkCount,
      });
    } else {
      await DeploymentRepository.clearEmbeddings(deployment.id);
    }

    return NextResponse.json({
      deploymentId: deployment.id,
      botName,
      status: deployment.status,
      configHash: deployment.configHash,
      ragMode,
      buildUrl: `/api/deployments/${deployment.id}/build`,
      downloadUrl: `/api/deployments/${deployment.id}/download`,
    });
  } catch (err) {
    console.error('[deployments:POST]', err);
    return NextResponse.json(
      { error: err.message || 'Save failed' },
      { status: 500 }
    );
  }
}
