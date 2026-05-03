import { getDb } from '../index.js';
import { randomUUID } from 'crypto';

export const SESSION_STATUS = {
  CREATED: 'created',
  PROCESSING: 'processing',
  AWAITING_CONFIRM: 'awaiting_confirm',
  DEPLOYING: 'deploying',
  DEPLOYED: 'deployed',
  EDITING: 'editing',
};

const DEFAULT_ENABLED_PROTOCOLS = {
  knowledge: false,
  formGathering: false,
  appointments: false,
  triage: false,
};

function jsonOrNull(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: 'local', // Lite is single-user
    status: row.status,
    preloadedContext: jsonOrNull(row.preloaded_context, {}),
    messages: jsonOrNull(row.messages, []),
    inferredIntent: row.inferred_intent,
    intentConfidence: row.intent_confidence,
    recommendedProtocols: jsonOrNull(row.recommended_protocols, {}),
    enabledProtocols: jsonOrNull(row.enabled_protocols, DEFAULT_ENABLED_PROTOCOLS),
    coreConfig: jsonOrNull(row.core_config, {}),
    identityConfig: jsonOrNull(row.identity_config, {}),
    protocolData: jsonOrNull(row.protocol_data, {}),
    generatedConfigs: jsonOrNull(row.generated_configs, {}),
    deploymentId: row.deployment_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    // Legacy alias for code that reads `session.botSpaceId`
    botSpaceId: null,
  };
}

function newModularSessionId() {
  return `mod_${randomUUID()}`;
}

function insertSession(fields) {
  const db = getDb();
  const now = Date.now();
  const id = fields.id || newModularSessionId();
  db.prepare(
    `INSERT INTO modular_sessions (
        id, status, preloaded_context, messages, inferred_intent, intent_confidence,
        recommended_protocols, enabled_protocols, core_config, identity_config,
        protocol_data, generated_configs, deployment_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    fields.status || SESSION_STATUS.CREATED,
    JSON.stringify(fields.preloadedContext || {}),
    JSON.stringify(fields.messages || []),
    fields.inferredIntent || null,
    fields.intentConfidence ?? null,
    JSON.stringify(fields.recommendedProtocols || {}),
    JSON.stringify(fields.enabledProtocols || DEFAULT_ENABLED_PROTOCOLS),
    JSON.stringify(fields.coreConfig || {}),
    JSON.stringify(fields.identityConfig || {}),
    JSON.stringify(fields.protocolData || {}),
    JSON.stringify(fields.generatedConfigs || {}),
    fields.deploymentId || null,
    now,
    now
  );
  return id;
}

function setField(sessionId, column, value) {
  const db = getDb();
  db.prepare(
    `UPDATE modular_sessions SET ${column} = ?, updated_at = ? WHERE id = ?`
  ).run(value, Date.now(), sessionId);
}

function setJsonField(sessionId, column, value) {
  setField(sessionId, column, JSON.stringify(value ?? null));
}

async function fetchSession(sessionId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM modular_sessions WHERE id = ?').get(sessionId);
  return rowToSession(row);
}

export const BuilderSessionRepository = {
  async create({ userId: _userId } = {}) {
    const id = insertSession({});
    return fetchSession(id);
  },

  async createWithContext({ userId: _userId, botSpaceId: _botSpaceId, preloadedContext, existingConfig }) {
    const fields = { preloadedContext };

    if (existingConfig) {
      fields.status = SESSION_STATUS.EDITING;
      fields.enabledProtocols = existingConfig.enabledProtocols || DEFAULT_ENABLED_PROTOCOLS;
      fields.coreConfig = existingConfig.core || {};
      fields.identityConfig = existingConfig.identity || {};
      fields.protocolData = existingConfig.protocolData || {};
      fields.generatedConfigs = existingConfig._deployment
        ? { _editingDeployment: existingConfig._deployment }
        : {};
    }

    const id = insertSession(fields);
    return fetchSession(id);
  },

  async findById(sessionId) {
    return fetchSession(sessionId);
  },

  async findByIdAndUserId(sessionId, _userId) {
    return fetchSession(sessionId);
  },

  async updateStatus(sessionId, _userId, status) {
    setField(sessionId, 'status', status);
    return fetchSession(sessionId);
  },

  async appendMessage(sessionId, _userId, message) {
    const session = await fetchSession(sessionId);
    if (!session) return null;
    const messages = [...(session.messages || []), { ...message, timestamp: Date.now() }];
    setJsonField(sessionId, 'messages', messages);
    return fetchSession(sessionId);
  },

  async updateInference(sessionId, _userId, { intent, confidence, recommendedProtocols }) {
    const db = getDb();
    db.prepare(
      `UPDATE modular_sessions
       SET inferred_intent = ?, intent_confidence = ?, recommended_protocols = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      intent,
      confidence ?? null,
      JSON.stringify(recommendedProtocols || {}),
      Date.now(),
      sessionId
    );
    return fetchSession(sessionId);
  },

  async updateProtocols(sessionId, _userId, enabledProtocols) {
    setJsonField(sessionId, 'enabled_protocols', enabledProtocols);
    return fetchSession(sessionId);
  },

  async updateCoreConfig(sessionId, _userId, coreConfig) {
    setJsonField(sessionId, 'core_config', coreConfig);
    return fetchSession(sessionId);
  },

  async updateIdentityConfig(sessionId, _userId, identityConfig) {
    setJsonField(sessionId, 'identity_config', identityConfig);
    return fetchSession(sessionId);
  },

  async updateProtocolData(sessionId, _userId, protocol, data) {
    const session = await fetchSession(sessionId);
    if (!session) return null;
    const protocolData = { ...(session.protocolData || {}), [protocol]: data };
    setJsonField(sessionId, 'protocol_data', protocolData);
    return fetchSession(sessionId);
  },

  async updateGeneratedConfig(sessionId, _userId, key, data) {
    const session = await fetchSession(sessionId);
    if (!session) return null;
    const generatedConfigs = { ...(session.generatedConfigs || {}), [key]: data };
    setJsonField(sessionId, 'generated_configs', generatedConfigs);
    return fetchSession(sessionId);
  },

  async updateStepProgress(_sessionId, _userId, _step, _status) {
    // Lite does not track per-step progress in the wizard flow.
    // Retained as a no-op for builder executor compatibility.
    return null;
  },

  async confirmProtocols(sessionId, _userId, confirmedProtocols) {
    // The UI's deploy button passes the recommend_protocols shape:
    //   { knowledge: { enabled: true, ... }, forms: { enabled: false, ... }, ... }
    // The chat-builder LLM, when it calls save_modular_bot directly, often
    // passes flat booleans:
    //   { knowledge: true, forms: false, ... }
    // Accept either — anything truthy at either level enables the protocol.
    // Without this, the LLM-direct path silently disables knowledge and the
    // artifact ships without embeddings.json.
    const flag = (v) => {
      if (v === null || v === undefined) return false;
      if (typeof v === 'object') return !!v.enabled;
      return !!v;
    };
    const cp = confirmedProtocols || {};
    const enabledProtocols = {
      knowledge: flag(cp.knowledge),
      formGathering: flag(cp.formGathering ?? cp.forms),
      appointments: flag(cp.appointments),
      triage: flag(cp.triage),
    };
    setJsonField(sessionId, 'enabled_protocols', enabledProtocols);
    return fetchSession(sessionId);
  },

  async cacheComposedInstructions(_sessionId, _userId, _instructions) {
    // Lite composes instructions on-demand at deploy time; no cache needed.
    return null;
  },

  async syncGeneratedConfigsToLegacy(sessionId, _userId) {
    // Copy generatedConfigs.{core,identity,forms,appointments,triage,knowledge}
    // into the legacy columns the deployer reads (coreConfig, identityConfig, protocolData).
    const session = await fetchSession(sessionId);
    if (!session) return null;
    const g = session.generatedConfigs || {};

    const coreConfig = {
      ...(session.coreConfig || {}),
      ...(g.core || {}),
      apiKeyId: session.preloadedContext?.defaultApiKeyId || g.core?.apiKeyId,
      _invertedFlow: true,
    };
    const mergedIdentity = {
      ...(session.identityConfig || {}),
      ...(g.identity || {}),
    };
    const identityConfig = {
      ...mergedIdentity,
      chatDisplayName:
        mergedIdentity.chatDisplayName ||
        mergedIdentity.displayName ||
        mergedIdentity.botName ||
        'Assistant',
    };

    const protocolData = { ...(session.protocolData || {}) };
    if (g.knowledge) {
      protocolData.knowledge = {
        ...(protocolData.knowledge || {}),
        domainDigest: g.knowledge.domainDigest,
        documents: (g.knowledge.documentIds || []).map((id) => ({ id })),
      };
    }
    if (g.forms) {
      protocolData.formGathering = {
        ...(protocolData.formGathering || {}),
        generatedFormJson: g.forms.formSchema,
        formCompletionWebhook: g.forms.formCompletionWebhook,
        afterSubmitChatMessage: g.forms.afterSubmitChatMessage,
        formSendHome: g.forms.formSendHome,
      };
    }
    if (g.appointments) {
      protocolData.appointments = {
        ...(protocolData.appointments || {}),
        destinations: g.appointments.destinations || [],
      };
    }
    if (g.triage) {
      protocolData.triage = {
        ...(protocolData.triage || {}),
        routes: g.triage.routes || [],
      };
    }

    const db = getDb();
    db.prepare(
      `UPDATE modular_sessions
       SET core_config = ?, identity_config = ?, protocol_data = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(coreConfig),
      JSON.stringify(identityConfig),
      JSON.stringify(protocolData),
      Date.now(),
      sessionId
    );
    return fetchSession(sessionId);
  },

  async linkDeployment(sessionId, _userId, deploymentId) {
    setField(sessionId, 'deployment_id', deploymentId);
    return fetchSession(sessionId);
  },

  async delete(sessionId, _userId) {
    const db = getDb();
    db.prepare('DELETE FROM modular_sessions WHERE id = ?').run(sessionId);
  },
};
