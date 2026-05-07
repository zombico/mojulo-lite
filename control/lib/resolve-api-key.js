import { ApiKeyRepository } from './db/repositories/apiKeys.js';
import { decryptApiKey } from './deployment-auth.js';
import { buildBedrockModelId } from './llm-providers.js';

/**
 * Inject a saved (encrypted) provider credential into a deployment config so
 * the browser never has to handle plaintext when picking a saved key. The
 * wizard sends apiKeyId; the route hands the deployment config + id here, and
 * we patch config.llm[provider] in place. Throws if the id is unknown or its
 * provider doesn't match config.llm.provider — both indicate a stale UI state
 * worth surfacing.
 */
export async function resolveSavedApiKeyIntoConfig(config, apiKeyId) {
  if (!apiKeyId || !config?.llm?.provider) return config;

  const record = await ApiKeyRepository.findById(apiKeyId);
  if (!record) {
    throw new Error(`Saved API key ${apiKeyId} not found`);
  }

  const provider = config.llm.provider;
  if (record.provider !== provider) {
    throw new Error(
      `Saved API key provider "${record.provider}" does not match selected provider "${provider}"`
    );
  }

  const plaintext = decryptApiKey(record.encryptedKey);

  if (provider === 'bedrock') {
    const credentials = JSON.parse(plaintext);
    const region = credentials.region || 'us-east-1';
    const baseModel = config.llm.bedrock?.model || '';
    config.llm.bedrock = {
      ...config.llm.bedrock,
      region,
      useIamRole: credentials.useIamRole || false,
      accessKeyId: credentials.accessKeyId || null,
      secretAccessKey: credentials.secretAccessKey || null,
      model: buildBedrockModelId(baseModel, region),
    };
  } else {
    config.llm[provider] = {
      ...config.llm[provider],
      apiKey: plaintext,
    };
  }

  return config;
}

/**
 * Whether a deployment config currently carries a usable provider credential
 * for its selected provider. Computed against the un-redacted config so the
 * GET endpoint can advertise "key on file" without exposing the value. The
 * wizard reads this to gate the credential requirement in edit mode.
 */
export function configHasStoredApiKey(config) {
  const provider = config?.llm?.provider;
  if (!provider) return false;
  const block = config.llm[provider];
  if (!block) return false;
  if (provider === 'bedrock') {
    return !!(block.useIamRole || (block.accessKeyId && block.secretAccessKey));
  }
  return !!block.apiKey;
}

/**
 * Strip provider credentials from a deployment config before returning it
 * to the browser. The deployment row stores plaintext (it's what gets baked
 * into the artifact's .env), but edit-mode hydration shouldn't have to
 * surface it to populate the wizard. Operates on a clone — caller's object
 * is not mutated.
 */
export function redactApiKeysFromConfig(config) {
  if (!config?.llm) return config;
  const clone = structuredClone(config);
  for (const key of Object.keys(clone.llm)) {
    if (key === 'provider') continue;
    const block = clone.llm[key];
    if (!block || typeof block !== 'object') continue;
    if ('apiKey' in block) block.apiKey = '';
    if ('accessKeyId' in block) block.accessKeyId = null;
    if ('secretAccessKey' in block) block.secretAccessKey = null;
  }
  return clone;
}

/**
 * When PATCH'ing an existing deployment without a fresh credential — the
 * wizard hydrated from the redacted GET and the user didn't paste/pick a
 * new key — copy the previously-stored credentials forward so the artifact
 * keeps working. Mutates newConfig in place. Provider-switch is detected by
 * comparing llm.provider; on switch we don't carry credentials across.
 */
export function preserveExistingCredentials(newConfig, oldConfig) {
  const provider = newConfig?.llm?.provider;
  if (!provider || !oldConfig?.llm) return newConfig;
  if (oldConfig.llm.provider !== provider) return newConfig;

  const newBlock = newConfig.llm[provider];
  const oldBlock = oldConfig.llm[provider];
  if (!newBlock || !oldBlock) return newConfig;

  if (provider === 'bedrock') {
    const newHasCreds = newBlock.useIamRole || (newBlock.accessKeyId && newBlock.secretAccessKey);
    if (!newHasCreds) {
      newBlock.useIamRole = oldBlock.useIamRole;
      newBlock.accessKeyId = oldBlock.accessKeyId;
      newBlock.secretAccessKey = oldBlock.secretAccessKey;
      newBlock.region = newBlock.region || oldBlock.region;
    }
  } else if (!newBlock.apiKey) {
    newBlock.apiKey = oldBlock.apiKey || '';
  }

  return newConfig;
}
