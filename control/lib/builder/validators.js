/**
 * Protocol Validators for Builder Flow
 *
 * Validates protocol-specific configuration before deployment.
 */

/**
 * Protocol-specific validators
 */
export const PROTOCOL_VALIDATORS = {
  /**
   * Validate knowledge protocol configuration
   * @param {Object} data - Knowledge protocol data
   * @param {Object} options - Validation options
   * @returns {{ valid: boolean, error?: string }}
   */
  knowledge: (data, options = {}) => {
    if (options.skipRag) {
      return { valid: true };
    }

    // Lite uses keyword RAG in the container, so ragSummary (LLM-composed by
    // process_documents) is the source of truth. Raw documents alone are
    // enough to satisfy the step — generate-rag will produce the summary
    // before deploy.
    const hasDocuments = data.documents && data.documents.length > 0;
    const hasRagSummary = data._hasRagSummary || !!data.ragSummary;

    if (!hasDocuments && !hasRagSummary) {
      return { valid: false, error: 'At least one document or a RAG summary is required' };
    }

    return { valid: true };
  },

  /**
   * Validate form gathering protocol configuration
   * @param {Object} data - Form gathering protocol data
   * @returns {{ valid: boolean, error?: string }}
   */
  formGathering: (data) => {
    if (!data.generatedFormJson) {
      return { valid: false, error: 'Form structure is required' };
    }

    try {
      const parsed =
        typeof data.generatedFormJson === 'string'
          ? JSON.parse(data.generatedFormJson)
          : data.generatedFormJson;

      if (!parsed.sections || !Array.isArray(parsed.sections)) {
        return { valid: false, error: 'Form must have sections array' };
      }

      return { valid: true };
    } catch (e) {
      return { valid: false, error: 'Invalid form JSON structure' };
    }
  },

  /**
   * Validate appointments protocol configuration
   * @param {Object} data - Appointments protocol data
   * @returns {{ valid: boolean, error?: string }}
   */
  appointments: (data) => {
    if (!data.destinations || data.destinations.length === 0) {
      return { valid: false, error: 'At least one calendar destination is required' };
    }

    for (const dest of data.destinations) {
      if (!dest.id || !dest.provider || !dest.popupUrl) {
        return {
          valid: false,
          error: 'All calendars must have id, provider, and popupUrl',
        };
      }

      const validProviders = ['calendly', 'cal.com'];
      if (!validProviders.includes(dest.provider)) {
        return {
          valid: false,
          error: `Invalid provider: ${dest.provider}. Must be one of: ${validProviders.join(', ')}`,
        };
      }
    }

    return { valid: true };
  },

  /**
   * Validate triage protocol configuration
   * @param {Object} data - Triage protocol data with routes array
   * @returns {{ valid: boolean, error?: string }}
   */
  triage: (data) => {
    // Support both { routes: [...] } structure and direct array (legacy)
    const routes = Array.isArray(data) ? data : data?.routes;

    if (!routes || !Array.isArray(routes) || routes.length === 0) {
      return { valid: false, error: 'At least one triage route is required' };
    }

    for (const route of routes) {
      if (!route.name || !route.description || !route.url) {
        return {
          valid: false,
          error: 'All routes must have name, description, and url',
        };
      }

      if (!route.deploymentId) {
        return {
          valid: false,
          error: `Route "${route.name}" is missing deploymentId`,
        };
      }
    }

    return { valid: true };
  },
};

/**
 * Validate core configuration
 * @param {Object} config - Core configuration
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCoreConfig(config) {
  const errors = [];

  if (!config.provider) errors.push('Provider is required');
  if (!config.model) errors.push('Model is required');
  // For inverted flow, apiKey is fetched at deployment time using apiKeyId
  // Only require apiKey if not using inverted flow
  if (!config._invertedFlow && !config.apiKey) {
    errors.push('API Key is required');
  }
  // For inverted flow, require apiKeyId instead
  if (config._invertedFlow && !config.apiKeyId) {
    errors.push('API Key ID is required');
  }
  if (!config.botName) errors.push('Bot Name is required');

  if (config.botName && !/^[a-z0-9-]+$/.test(config.botName)) {
    errors.push('Bot name must contain only lowercase letters, numbers, and hyphens');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate identity configuration
 * @param {Object} config - Identity configuration
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateIdentityConfig(config) {
  const errors = [];

  if (!config.objective) errors.push('Objective is required');
  if (!config.firstMessage) errors.push('First Message is required');
  if (!config.chatDisplayName) errors.push('Chat Display Name is required');

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that at least one protocol is enabled
 * @param {Object} enabledProtocols - Protocol toggles
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEnabledProtocols(enabledProtocols) {
  const hasEnabled =
    enabledProtocols.knowledge ||
    enabledProtocols.formGathering ||
    enabledProtocols.appointments ||
    enabledProtocols.triage;

  return {
    valid: hasEnabled,
    error: hasEnabled ? null : 'At least one protocol must be enabled',
  };
}

/**
 * Validate session is ready for deployment
 * @param {Object} session - Modular session object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSessionForDeployment(session) {
  const errors = [];

  // Check core config
  if (!session.coreConfig) {
    errors.push('Core configuration is missing');
  } else {
    const coreValidation = validateCoreConfig(session.coreConfig);
    if (!coreValidation.valid) {
      errors.push(...coreValidation.errors);
    }
  }

  // Check identity config
  if (!session.identityConfig) {
    errors.push('Identity configuration is missing');
  } else {
    const identityValidation = validateIdentityConfig(session.identityConfig);
    if (!identityValidation.valid) {
      errors.push(...identityValidation.errors);
    }
  }

  // Check enabled protocols
  const protocolValidation = validateEnabledProtocols(session.enabledProtocols);
  if (!protocolValidation.valid) {
    errors.push(protocolValidation.error);
  }

  // Validate each enabled protocol's data
  for (const [protocol, enabled] of Object.entries(session.enabledProtocols)) {
    if (enabled && PROTOCOL_VALIDATORS[protocol]) {
      const protocolData = session.protocolData[protocol] || {};
      const validation = PROTOCOL_VALIDATORS[protocol](protocolData);
      if (!validation.valid) {
        errors.push(`${protocol}: ${validation.error}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
