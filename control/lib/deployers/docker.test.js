import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import AdmZip from 'adm-zip';

// docker.js reads LITE_TEMPLATE_PATH, ARTIFACTS_DIR, BOT_IMAGE, BOT_DEFAULT_PORT,
// and MOJULO_OFFLINE_BUILD at module-load time (top-level const). The storage
// module reads STORAGE_ROOT the same way. So all six must be in place before
// the dynamic import below, and the module is imported exactly once per file.
let DockerDeployer;

const ENV_KEYS = [
  'LITE_TEMPLATE_PATH',
  'ARTIFACTS_DIR',
  'STORAGE_ROOT',
  'BOT_IMAGE',
  'MOJULO_OFFLINE_BUILD',
  'BOT_DEFAULT_PORT',
];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let tmpRoot;
let templateDir;
let artifactsDir;
let storageDir;

// Files placed under the fake template root. Every name in PREBUILT_EXCLUDES
// that the deployer would *actively* filter out is represented here so the
// fixture asserts the exclude set is honored end-to-end — not just trusted.
async function createFakeTemplate(root) {
  await fsp.mkdir(root, { recursive: true });

  // Top-level files that PREBUILT_EXCLUDES drops.
  await fsp.writeFile(path.join(root, 'Dockerfile'), '# fake');
  await fsp.writeFile(path.join(root, '.dockerignore'), 'fake');
  await fsp.writeFile(path.join(root, 'server.js'), '// fake');
  await fsp.writeFile(path.join(root, 'package.json'), '{}');
  await fsp.writeFile(path.join(root, 'package-lock.json'), '{}');

  // Directories that PREBUILT_EXCLUDES drops. Add one file each so a stray
  // recursive copy would leave a fingerprint we can grep for.
  for (const dir of ['helper', 'middleware', 'client', 'models', 'scripts', 'integration']) {
    await fsp.mkdir(path.join(root, dir));
    await fsp.writeFile(path.join(root, dir, 'leak.txt'), `should not appear in zip: ${dir}`);
  }

  // Directories that TEMPLATE_EXCLUDES drops (inherited by PREBUILT_EXCLUDES):
  // these would silently bloat or corrupt the artifact if the filter regresses.
  await fsp.mkdir(path.join(root, 'node_modules'));
  await fsp.writeFile(path.join(root, 'node_modules', 'pkg.json'), '{}');
  await fsp.mkdir(path.join(root, 'data'));
  await fsp.writeFile(path.join(root, 'data', 'conversation.db'), 'fake-sqlite');
  await fsp.mkdir(path.join(root, 'documents'));
  await fsp.writeFile(path.join(root, 'documents', 'leak.pdf'), 'fake-pdf');
  await fsp.mkdir(path.join(root, 'config'));
  await fsp.writeFile(path.join(root, 'config', 'old.json'), '{"stale": true}');
  await fsp.writeFile(path.join(root, '.env'), 'STALE=1');

  // A file outside every exclude set — survives the copy. Lets us assert
  // "the filter isn't accidentally dropping everything", complementing the
  // negative assertions.
  await fsp.writeFile(path.join(root, 'NOTICE.txt'), 'survives prebuilt copy');
}

function baseConfig() {
  return {
    // _composedInstructions short-circuits composeInstructions(); the composer
    // has its own coverage (planned at 2e), and pulling its full transitive
    // import surface into these tests would couple two failure modes.
    _composedInstructions: 'fake composed instructions',
    llm: { provider: 'anthropic', anthropic: { model: 'claude-sonnet-4-6' } },
    config: { name: 'Fixture Bot', objective: 'help with tests' },
  };
}

function entryNames(zipPath) {
  return new AdmZip(zipPath).getEntries().map((e) => e.entryName).sort();
}

// archiver may or may not emit explicit directory entries; check by file path.
function anyEntryUnder(entries, name) {
  return entries.some((e) => e === name || e.startsWith(`${name}/`));
}

beforeAll(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'docker-deployer-test-'));
  templateDir = path.join(tmpRoot, 'template');
  artifactsDir = path.join(tmpRoot, 'artifacts');
  storageDir = path.join(tmpRoot, 'storage');

  await createFakeTemplate(templateDir);
  await fsp.mkdir(artifactsDir, { recursive: true });
  await fsp.mkdir(storageDir, { recursive: true });

  process.env.LITE_TEMPLATE_PATH = templateDir;
  process.env.ARTIFACTS_DIR = artifactsDir;
  process.env.STORAGE_ROOT = storageDir;
  process.env.BOT_IMAGE = 'ghcr.io/zombico/mojulo-bot:test';
  process.env.BOT_DEFAULT_PORT = '3000';
  delete process.env.MOJULO_OFFLINE_BUILD;

  ({ DockerDeployer } = await import('./docker.js'));
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
  if (tmpRoot) await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe('PREBUILT artifact file tree', () => {
  // Single deploy() call, multiple assertions against the same zip — the
  // build is the expensive step (~ filesystem copy + archive). The test is
  // "the prebuilt-image artifact contains exactly the files a user needs and
  // nothing the image already provides."
  let zipPath;
  let entries;

  beforeAll(async () => {
    const deployer = new DockerDeployer();
    const result = await deployer.deploy({
      deploymentId: 'prebuilt-fixture',
      botName: 'fixture-bot',
      apiKey: 'bot_fixture_apikey',
      config: baseConfig(),
      enabledProtocols: { knowledge: true },
    });
    zipPath = result.artifactPath;
    entries = entryNames(zipPath);
  });

  it('writes the zip to ARTIFACTS_DIR with the expected filename', () => {
    expect(zipPath).toBe(path.join(artifactsDir, 'fixture-bot-prebuilt-fixture.zip'));
    expect(fs.existsSync(zipPath)).toBe(true);
  });

  it('includes the canonical artifact files a user needs to boot the bot', () => {
    const required = [
      'config/instructions.txt',
      'config/config.json',
      'docker-compose.yml',
      '.env.example',
      '.env',
      'README.md',
      'NOTICE.txt',
    ];
    for (const name of required) {
      expect(entries).toContain(name);
    }
  });

  it('excludes every entry baked into the GHCR image (PREBUILT_EXCLUDES spec)', () => {
    // These are the file/dir names PREBUILT_EXCLUDES drops because they
    // already ship inside ghcr.io/zombico/mojulo-bot. If any of them sneak
    // into the zip, the artifact gains weight and risks divergence between
    // the user-mounted file and the image's baked copy.
    const excluded = [
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
    ];
    for (const name of excluded) {
      expect(anyEntryUnder(entries, name)).toBe(false);
    }
  });

  it('excludes infrastructure dirs that would silently bloat or stale-poison the artifact', () => {
    // TEMPLATE_EXCLUDES (inherited by PREBUILT_EXCLUDES). node_modules and
    // documents would leak host state; the .env from the template would leak
    // the developer's local secrets. The deployer creates `data/` fresh as
    // the docker compose mount point, so the directory entry is expected —
    // but the template's stale conversation.db inside it must not survive.
    expect(anyEntryUnder(entries, 'node_modules')).toBe(false);
    expect(anyEntryUnder(entries, 'documents')).toBe(false);
    expect(entries).not.toContain('data/conversation.db');

    // .env is rewritten by the deployer — entry must be present but content
    // must be the deployer's, not the template's stale copy.
    expect(entries).toContain('.env');
    const envBody = new AdmZip(zipPath).readAsText('.env');
    expect(envBody).not.toContain('STALE=1');
    expect(envBody).toContain('MOJULO_API_KEY=bot_fixture_apikey');

    // The stale config/old.json from the template must not survive — the
    // deployer creates config/ fresh and writes only its own files there.
    expect(entries).not.toContain('config/old.json');
  });

  it('does not produce a -with-docs variant when withDocs is false', () => {
    // The lean cache the deployment row tracks is the no-docs zip. A regression
    // that always emitted -with-docs would double disk usage and the GC script
    // wouldn't reap the right file.
    expect(fs.existsSync(zipPath.replace('.zip', '-with-docs.zip'))).toBe(false);
  });
});

describe('opticalReadFields bundling axis', () => {
  it('writes config/opticalReadFields.json byte-identical to the input when fields are present', async () => {
    // The bot's /api/extract endpoint reads this file at boot and uses the
    // idName set to narrow LLM-returned extractedFields. Drift on the file's
    // bytes — extra keys, reordered fields, prettifier changes — silently
    // changes what the bot accepts vs what the wizard saved.
    const fields = [
      { idName: 'firstName', label: 'First Name', hint: 'Top-left of the ID' },
      { idName: 'dob', label: 'Date of Birth', hint: 'After "DOB:"' },
      { idName: 'idNumber', label: 'ID Number', hint: 'Bottom-right barcode' },
    ];
    const deployer = new DockerDeployer();
    const { artifactPath } = await deployer.deploy({
      deploymentId: 'optical-yes',
      botName: 'optical-bot',
      apiKey: 'bot_optical',
      config: baseConfig(),
      opticalReadFields: fields,
      enabledProtocols: { opticalRead: true },
    });

    const zip = new AdmZip(artifactPath);
    const entry = zip.getEntry('config/opticalReadFields.json');
    expect(entry).not.toBeNull();
    const raw = entry.getData().toString('utf8');
    expect(JSON.parse(raw)).toEqual(fields);
    // Pin the on-disk form too — the bot loader does a plain JSON.parse, but
    // operator tools that diff artifacts across builds will notice serializer
    // drift here long before the bot does.
    expect(raw).toBe(JSON.stringify(fields, null, 2));
  });

  it('omits config/opticalReadFields.json entirely when no fields are configured', async () => {
    // Bot boot loader leaves opticalReadFields = null on missing file, which
    // makes /api/extract short-circuit with a "disabled" response (covered by
    // the optical-extract unit tests). A regression that always emits the
    // file — even empty — would silently flip /api/extract on.
    const deployer = new DockerDeployer();
    const { artifactPath } = await deployer.deploy({
      deploymentId: 'optical-no',
      botName: 'no-optical-bot',
      apiKey: 'bot_no_optical',
      config: baseConfig(),
      opticalReadFields: [],
      enabledProtocols: {},
    });

    const zip = new AdmZip(artifactPath);
    expect(zip.getEntry('config/opticalReadFields.json')).toBeNull();
  });
});

describe('embeddings.json copy fidelity', () => {
  it('copies the staged embeddings blob bit-for-bit into the artifact', async () => {
    // #1 silent-corruption risk per the test plan: if the copy ever transforms
    // (re-pretty-prints, re-encodes, drops fields), every downstream cosine
    // search runs against a different index than what the wizard previewed,
    // and the failure surfaces months later as confusing retrieval misses.
    const key = 'embeddings/fixture/embeddings.json';
    const blob = Buffer.from(
      JSON.stringify({
        model: 'multilingual-e5-small',
        chunks: [
          { text: 'appointment booking', vector: [0.11, 0.22, 0.33], metadata: { source: 'knowledge' } },
          { text: 'triage to billing', vector: [0.44, 0.55, 0.66], metadata: { source: 'triage-route', deploymentId: 'b1' } },
        ],
      }),
      'utf8'
    );
    const blobPath = path.join(storageDir, key);
    await fsp.mkdir(path.dirname(blobPath), { recursive: true });
    await fsp.writeFile(blobPath, blob);
    const expectedSha = crypto.createHash('sha256').update(blob).digest('hex');

    const deployer = new DockerDeployer();
    const { artifactPath } = await deployer.deploy({
      deploymentId: 'embeddings-fixture',
      botName: 'embed-bot',
      apiKey: 'bot_embed',
      config: baseConfig(),
      enabledProtocols: { knowledge: true },
      embeddingStorageKey: key,
      embeddingModel: 'multilingual-e5-small',
      embeddingChunkCount: 2,
    });

    const zip = new AdmZip(artifactPath);
    const entry = zip.getEntry('config/embeddings.json');
    expect(entry).not.toBeNull();
    const actual = entry.getData();
    expect(crypto.createHash('sha256').update(actual).digest('hex')).toBe(expectedSha);
    expect(Buffer.compare(actual, blob)).toBe(0);

    // The bot's config.json must point at the copied file under the
    // documented path — runtime initialization branches on this being
    // present, not on the embeddings file existing on its own.
    const configJson = JSON.parse(zip.readAsText('config/config.json'));
    expect(configJson.config.rag.embeddingsPath).toBe('./config/embeddings.json');
    expect(configJson.config.rag.embeddingModel).toBe('multilingual-e5-small');
    expect(configJson.config.rag.embeddingChunkCount).toBe(2);
  });

  it('omits config/embeddings.json when no embeddingStorageKey is provided', async () => {
    // Knowledge/triage disabled artifacts must not ship a phantom embeddings
    // file — the runtime's "missing file → silently disable RAG" path is
    // load-bearing only when the file genuinely isn't there.
    const deployer = new DockerDeployer();
    const { artifactPath } = await deployer.deploy({
      deploymentId: 'no-embeddings',
      botName: 'plain-bot',
      apiKey: 'bot_plain',
      config: baseConfig(),
      enabledProtocols: { formGathering: true },
      embeddingStorageKey: null,
    });

    const zip = new AdmZip(artifactPath);
    expect(zip.getEntry('config/embeddings.json')).toBeNull();
    const configJson = JSON.parse(zip.readAsText('config/config.json'));
    expect(configJson.config.rag.embeddingsPath).toBeUndefined();
  });
});
