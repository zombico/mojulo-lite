import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { composeInstructions } from '../composer/composer.js';
import { downloadToBuffer } from '../storage/index.js';

const LITE_TEMPLATE_PATH =
  process.env.LITE_TEMPLATE_PATH ||
  path.resolve(process.cwd(), '..', 'lite-template');

const ARTIFACTS_DIR =
  process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'data', 'artifacts');

const BOT_DEFAULT_PORT = process.env.BOT_DEFAULT_PORT || '3000';

// Prebuilt bot image published by .github/workflows/publish-bot-image.yml.
// Pin an exact version per release — never ship :latest to users.
const BOT_IMAGE =
  process.env.BOT_IMAGE || 'ghcr.io/zombico/mojulo-bot:0.1.0';

// Escape hatch for users who can't reach ghcr.io (air-gapped networks,
// firewalls). Set MOJULO_OFFLINE_BUILD=1 on the control plane and the
// emitted artifact bundles the full source + Dockerfile and builds locally.
const OFFLINE_BUILD = process.env.MOJULO_OFFLINE_BUILD === '1';

const TEMPLATE_EXCLUDES = new Set([
  'node_modules',
  '.next',
  '.env',
  '.DS_Store',
  'data',
  'documents',
  'config',
]);

// In prebuilt-image mode the source code, Dockerfile, and node-side assets
// are baked into ghcr.io/zombico/mojulo-bot. Including them in the ZIP
// would just be dead weight — the artifact only needs the per-bot config,
// docs, and compose file.
const PREBUILT_EXCLUDES = new Set([
  ...TEMPLATE_EXCLUDES,
  'Dockerfile',
  '.dockerignore',
  'server.js',
  'package.json',
  'package-lock.json',
  'helper',
  'middleware',
  'client',
  'models',
  'scripts',
  'integration',
]);

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyTemplateFiles(srcRoot, dstRoot, excludes) {
  const entries = await fsp.readdir(srcRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (excludes.has(entry.name)) continue;
    const srcPath = path.join(srcRoot, entry.name);
    const dstPath = path.join(dstRoot, entry.name);
    if (entry.isDirectory()) {
      await ensureDir(dstPath);
      await copyTemplateFiles(srcPath, dstPath, excludes);
    } else {
      await fsp.copyFile(srcPath, dstPath);
    }
  }
}

function buildDockerCompose(botName) {
  const imageOrBuild = OFFLINE_BUILD
    ? `build: .
    image: mojulo/bot:local`
    : `image: ${BOT_IMAGE}`;

  return `version: '3.8'

services:
  ${botName}:
    ${imageOrBuild}
    container_name: ${botName}
    ports:
      - "${BOT_DEFAULT_PORT}:3000"
    env_file:
      - .env
    volumes:
      - ./data:/data
      - ./config:/app/config
      - ./documents:/app/documents
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
`;
}

function buildEnvExample(llmConfig) {
  const provider = llmConfig.provider || 'anthropic';
  return [
    '# Mojulo-Lite bot runtime env.',
    '# The builder baked your selected LLM provider + model into config/config.json,',
    `# so you only need to paste the matching API key below before running 'docker compose up'.`,
    '',
    `LLM_PROVIDER=${provider}`,
    '',
    '# Uncomment and set the key for the provider you selected:',
    '# OPENAI_API_KEY=',
    '# ANTHROPIC_API_KEY=',
    '# GEMINI_API_KEY=',
    '# COHERE_API_KEY=',
    '',
    '# AWS Bedrock (only if provider=bedrock)',
    '# AWS_REGION=us-east-1',
    '# AWS_ACCESS_KEY_ID=',
    '# AWS_SECRET_ACCESS_KEY=',
    '',
    '# Admin API key for protected endpoints',
    `MOJULO_API_KEY=`,
    '',
  ].join('\n');
}

function buildReadme(botName, enabledProtocols = {}, hasEmbeddings = false) {
  const protocols = Object.entries(enabledProtocols)
    .filter(([, v]) => v)
    .map(([k]) => `- ${k}`)
    .join('\n') || '- (base only)';

  const vectorSection = hasEmbeddings ? `
## Vector RAG (this bot)

The corpus embeddings ship in \`config/embeddings.json\`; the embedding
model (multilingual-e5-small, ONNX) ships in \`models/\`. User queries
are embedded in-process, then cosine similarity runs locally against
the baked corpus.

- No factory dependency at runtime — the bot is fully self-contained.
- If the model files in \`models/\` are missing or corrupt, queries fail
  loudly.

` : '';

  const formsSection = enabledProtocols.formGathering ? `
## Form submissions

Completed forms are captured to the bot's local SQLite database
(\`data/conversation.db\`, table \`form_submissions\`) on every completion,
independent of any webhook configuration. The webhook (\`formSendHome\`) is
attempted in addition when configured; failures are recorded but never block
local capture.

Admin endpoints (require \`x-mojulo-api-key: <MOJULO_API_KEY>\`):

- \`GET /api/forms\` — list submissions. Query params: \`conversationId\`,
  \`since\` (ISO timestamp), \`limit\` (default 100, max 1000).
- \`GET /api/forms/:id\` — fetch one submission.
- \`GET /api/forms/export\` — CSV export with the same filters. Includes a
  UTF-8 BOM so non-Latin field values render correctly in Excel.
` : '';

  const quickStart = OFFLINE_BUILD
    ? `## Quick start

1. Paste your LLM provider API key into \`.env\` (see \`.env.example\`).
2. Build and run:

   \`\`\`bash
   docker compose up --build
   \`\`\`

   First run builds the image locally (~3min). Subsequent runs skip straight to start.

3. Open http://localhost:${BOT_DEFAULT_PORT}.`
    : `## Quick start

1. Paste your LLM provider API key into \`.env\` (see \`.env.example\`).
2. Run:

   \`\`\`bash
   docker compose up
   \`\`\`

   First run pulls the bot image from GHCR (~30s on a typical connection); subsequent runs are instant.

3. Open http://localhost:${BOT_DEFAULT_PORT}.`;

  const composeLine = OFFLINE_BUILD
    ? `\`docker-compose.yml\` — builds \`mojulo/bot:local\` from the Dockerfile in this directory.`
    : `\`docker-compose.yml\` — pulls \`${BOT_IMAGE}\` and runs it with your config mounted.`;

  return `# ${botName}

Portable Mojulo bot artifact. One image, one zip, one command.

${quickStart}

## What's inside

- ${composeLine}
- \`.env.example\` — LLM keys + webhook URLs.
- \`config/\`
  - \`instructions.txt\` — composed protocol cartridges.
  - \`config.json\` — bot identity + LLM provider + model.
  - \`formFormat.json\` — ghost-form schema (if forms enabled).
  - \`embeddings.json\` — pre-baked vector index (if knowledge or triage enabled).

## Enabled protocols

${protocols}
${vectorSection}${formsSection}
## Deploying elsewhere

The artifact is endpoint-agnostic. Any host that can run \`docker compose up\`
works: Fly.io, Railway, a $5 VPS, or your laptop.
`;
}

function writeJson(file, data) {
  return fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve({ bytes: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export class DockerDeployer {
  /**
   * Build a portable bot artifact. Pure: takes config in, writes a ZIP out.
   * Caller is responsible for any DB updates around the call.
   *
   * @param {Object} params
   * @param {string} params.deploymentId - Used only for staging dir + zip filename
   * @param {string} params.botName - Slug-friendly bot name
   * @param {Object} params.config - Deployment config
   * @param {string} params.apiKey - Generated admin API key for bot
   * @param {Array} [params.appointmentDestinations]
   * @param {Array} [params.triageDestinations]
   * @param {Object} [params.enabledProtocols]
   * @param {string} [params.embeddingStorageKey]
   * @param {string} [params.embeddingModel]
   * @param {number} [params.embeddingChunkCount]
   */
  async deploy(params) {
    const {
      deploymentId,
      botName,
      config,
      apiKey,
      appointmentDestinations = [],
      triageDestinations = [],
      enabledProtocols = {},
      embeddingStorageKey = null,
      embeddingModel = null,
      embeddingChunkCount = null,
    } = params;

    if (!fs.existsSync(LITE_TEMPLATE_PATH)) {
      throw new Error(
        `Lite template not found at ${LITE_TEMPLATE_PATH}. Set LITE_TEMPLATE_PATH or place it next to control/.`
      );
    }

    await ensureDir(ARTIFACTS_DIR);
    const stagingDir = path.join(ARTIFACTS_DIR, `${botName}-${deploymentId}`);
    if (fs.existsSync(stagingDir)) await fsp.rm(stagingDir, { recursive: true, force: true });
    await ensureDir(stagingDir);

    // 1. Copy lite-template source into the staging root.
    //    Prebuilt-image mode (default) drops everything baked into the
    //    published GHCR image; offline mode keeps the full template so
    //    `docker compose up` can build from source on the user's machine.
    const excludes = OFFLINE_BUILD ? TEMPLATE_EXCLUDES : PREBUILT_EXCLUDES;
    await copyTemplateFiles(LITE_TEMPLATE_PATH, stagingDir, excludes);

    // 2. Create config, data dirs
    const configDir = path.join(stagingDir, 'config');
    const dataDir = path.join(stagingDir, 'data');
    await ensureDir(configDir);
    await ensureDir(dataDir);

    // 3. Compose instructions.txt from enabled protocols
    const objective = config.objective || `Help users as ${botName}`;
    const protocolData = {
      formStructure: config.formStructure,
      appointments: appointmentDestinations,
      triage: triageDestinations,
    };
    const instructions =
      config._composedInstructions ||
      (await composeInstructions({ objective, enabledProtocols, protocolData }));
    await fsp.writeFile(path.join(configDir, 'instructions.txt'), instructions, 'utf8');

    // 4. Write config.json — container reads bot identity + LLM provider here
    const hasEmbeddings = !!embeddingStorageKey;
    const configJson = {
      config: {
        ...config.config,
        instructions: './config/instructions.txt',
        rag: {
          ...(config.config?.rag || {}),
          ...(hasEmbeddings
            ? {
                embeddingsPath: './config/embeddings.json',
                embeddingModel,
                embeddingChunkCount,
              }
            : {}),
        },
      },
      llm: config.llm,
    };
    await writeJson(path.join(configDir, 'config.json'), configJson);

    // 5. Write per-protocol config files
    if (config.formStructure) {
      await writeJson(path.join(configDir, 'formFormat.json'), config.formStructure);
    }
    if (appointmentDestinations.length > 0) {
      await writeJson(path.join(configDir, 'calendarConfig.json'), {
        destinations: appointmentDestinations,
      });
    }
    if (triageDestinations.length > 0) {
      // Captured at build time — never re-resolved at runtime. The JSON is
      // the authoritative deploymentId list the LLM picks from; route
      // description text lives in embeddings.json for retrieval reinforcement.
      await writeJson(path.join(configDir, 'triageRoutes.json'), triageDestinations);
    }

    // 6. Vector RAG: copy the pre-baked embeddings blob into the artifact.
    //    Build is pure copy — no embed call here. Re-build = re-copy. Bots
    //    with neither knowledge nor triage have no embeddings; runtime tolerates
    //    the missing file and silently disables RAG.
    if (hasEmbeddings) {
      const embeddingsBuffer = await downloadToBuffer(embeddingStorageKey);
      await fsp.writeFile(path.join(configDir, 'embeddings.json'), embeddingsBuffer);
    }

    // 7. Write docker-compose.yml + .env.example + README.md
    await fsp.writeFile(
      path.join(stagingDir, 'docker-compose.yml'),
      buildDockerCompose(botName),
      'utf8'
    );
    await fsp.writeFile(
      path.join(stagingDir, '.env.example'),
      buildEnvExample(config.llm || {}),
      'utf8'
    );
    await fsp.writeFile(
      path.join(stagingDir, 'README.md'),
      buildReadme(botName, enabledProtocols, hasEmbeddings),
      'utf8'
    );

    // 9. Write the bot's admin API key into the staging .env (users are
    //    expected to replace the LLM key themselves). The pre-populated
    //    MOJULO_API_KEY lets the bot protect its /api/conversations
    //    endpoints immediately.
    await fsp.writeFile(
      path.join(stagingDir, '.env'),
      `MOJULO_API_KEY=${apiKey}\n# Paste your LLM provider key below. See .env.example.\n`,
      'utf8'
    );

    // 10. Zip it up
    const zipPath = path.join(ARTIFACTS_DIR, `${botName}-${deploymentId}.zip`);
    await zipDirectory(stagingDir, zipPath);

    return {
      success: true,
      appName: botName,
      artifactPath: zipPath,
      relativeArtifactPath: path.relative(process.cwd(), zipPath),
      url: `http://localhost:${BOT_DEFAULT_PORT}`,
    };
  }

  async destroy(_appId) {
    // Lite: "destroy" just removes the stored artifact; containers the user
    // ran themselves are theirs to stop.
    return { success: true };
  }
}
