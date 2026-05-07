/**
 * Config Builder Utility
 * Transforms simple form data into the config.json structure expected by dragbot-factory
 */

import { LLM_PROVIDERS, buildBedrockModelId, stripBedrockModelPrefix } from './llm-providers.js';

/**
 * Extract terms and conditions text from formStructure's consentToTC field
 * @param {Object} formStructure - The form structure object with sections
 * @returns {string} The T&C text or empty string
 */
function extractTermsFromFormStructure(formStructure) {
  if (!formStructure?.sections) return '';

  for (const section of formStructure.sections) {
    for (const field of section.fields || []) {
      if (field.id === 'consentToTC' && field.termsText) {
        return field.termsText;
      }
    }
  }
  return '';
}

/**
 * Inject consentToTC field into form structure if terms and conditions exist
 * @param {Object} formStructure - The form structure object with sections
 * @param {string} termsAndConditions - The T&C text
 * @returns {Object} Modified form structure with consentToTC field appended
 */
function injectConsentToTCField(formStructure, termsAndConditions) {
  if (!formStructure || !termsAndConditions?.trim()) {
    return formStructure;
  }

  // Deep clone to avoid mutating original
  const modified = JSON.parse(JSON.stringify(formStructure));

  // Create the consentToTC field
  const consentField = {
    id: 'consentToTC',
    label: 'I agree to the Terms and Conditions',
    type: 'checkbox',
    required: true,
    termsText: termsAndConditions.trim()
  };

  // Append to the last section's fields
  if (modified.sections && modified.sections.length > 0) {
    const lastSection = modified.sections[modified.sections.length - 1];
    lastSection.fields.push(consentField);
  }

  return modified;
}

/**
 * Build LLM configuration section
 *
 * When apiKey is empty (saved-key-by-reference flow), the selected provider's
 * credential fields are emitted blank — the server fills them in by decrypting
 * the api_keys row before persisting the deployment. See resolve-api-key.js.
 */
export function buildLLMConfig(provider, apiKey, model, additionalSettings = {}) {
  // Build config with all providers (empty configs for non-selected providers)
  const llmConfig = { provider };
  const usingSavedKey = !apiKey;

  // Add config for each provider
  Object.keys(LLM_PROVIDERS).forEach(key => {
    const keyConfig = LLM_PROVIDERS[key];

    if (key === 'bedrock') {
      // Bedrock uses different config structure (credentials stored as JSON in apiKey)
      if (key === provider && !usingSavedKey) {
        // Parse credentials from apiKey JSON
        const credentials = JSON.parse(apiKey);
        // Ensure region is always set (fallback to us-east-1)
        const region = credentials.region || 'us-east-1';
        // Apply geographic prefix to model ID for cross-region inference
        const prefixedModel = buildBedrockModelId(model, region);
        llmConfig[key] = {
          region,
          useIamRole: credentials.useIamRole,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          model: prefixedModel,
        };
      } else if (key === provider && usingSavedKey) {
        // Saved-key path: emit user's model unprefixed; server will decrypt
        // the saved credentials, set the region, and apply the geo prefix.
        llmConfig[key] = {
          region: 'us-east-1',
          useIamRole: false,
          accessKeyId: null,
          secretAccessKey: null,
          model,
        };
      } else {
        // Empty Bedrock config
        llmConfig[key] = {
          region: 'us-east-1',
          useIamRole: true,
          accessKeyId: null,
          secretAccessKey: null,
          model: keyConfig.defaultModel,
        };
      }
    } else {
      // Standard providers with baseURL/endpoint
      if (key === provider) {
        const baseConfig = {
          apiKey,
          model,
          baseURL: keyConfig.baseURL,
          endpoint: keyConfig.endpoint,
          timeout: 300000
        };

        // Add provider-specific settings
        if (key === 'openai') {
          baseConfig.organization = additionalSettings.organization || '';
        }
        if (key === 'anthropic') {
          baseConfig.maxTokens = additionalSettings.maxTokens || 4096;
        }

        llmConfig[key] = baseConfig;
      } else {
        // Empty config for non-selected provider
        const emptyConfig = {
          apiKey: '',
          model: keyConfig.defaultModel,
          baseURL: keyConfig.baseURL,
          endpoint: keyConfig.endpoint,
          timeout: 300000
        };

        // Add provider-specific fields for empty configs
        if (key === 'openai') {
          emptyConfig.organization = '';
        }
        if (key === 'anthropic') {
          emptyConfig.maxTokens = 4096;
        }

        llmConfig[key] = emptyConfig;
      }
    }
  });

  return llmConfig;
}

/**
 * Build full deployment config from form data
 *
 * @param {Object} formData - Simple form state
 * @param {string} formData.botName - Bot name
 * @param {string} formData.objective - Bot objective (MANDATORY)
 * @param {string} formData.firstMessage - Welcome message
 * @param {string} formData.provider - LLM provider (openai|anthropic|gemini|cohere)
 * @param {string} formData.apiKey - API key for selected provider
 * @param {string} formData.model - Model name
 * @param {Array} formData.suggestedPrompts - Optional suggested prompts
 * @param {Object} formData.uiSettings - Optional UI customization
 * @param {Array} formData.triageDestinations - Triage destinations (for triage flow)
 * @param {string} flowType - The wizard flow type ('standard', 'conversational', 'triage', 'modular')
 * @param {Object} options - Additional options
 * @param {Object} options.enabledProtocols - For modular flow: { knowledge, formGathering, appointments }
 * @returns {Object} Full deployment config
 */
export function buildDeploymentConfig(formData, flowType = 'conversational', options = {}) {
  const { enabledProtocols, apiKeyId } = options;

  const isModularTriage = flowType === 'modular' && enabledProtocols?.triage;
  const isAppointments = flowType === 'modular' && enabledProtocols?.appointments;
  const isSkipRag = !!formData.skipRag;

  const required = apiKeyId
    ? ['botName', 'objective', 'provider', 'model']
    : ['botName', 'objective', 'provider', 'apiKey', 'model'];
  const missing = required.filter(field => !formData[field]);

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  const configSection = {
    instructions: './config/instructions.txt',
    name: formData.botName,
    chatDisplayName: formData.uiSettings?.chatDisplayName || 'Bot',
    placeholder: formData.uiSettings?.placeholder || 'Type your message...',
    firstMessage: formData.firstMessage || `Welcome! I'm ${formData.botName}. How can I help you?`,
    suggestedPrompts: formData.suggestedPrompts || [],
    actionsBar: {
      showBar: false,
      showSourceButton: false,
      showMetadataButton: false,
      showCopyButton: false,
      showSuggestedPrompts: false
    }
  };

  // Add form-related fields if form structure exists
  if (formData.formStructure?.generatedJson) {
    // Validate required form fields - webhook is optional if formSendHome is enabled
    const hasWebhook = formData.formCompletionWebhook && formData.formCompletionWebhook.trim();
    const hasFormSendHome = formData.formSendHome;
    if (!hasWebhook && !hasFormSendHome) {
      throw new Error('Either formCompletionWebhook or formSendHome is required when form collection is enabled');
    }
    if (!formData.afterSubmitChatMessage || !formData.afterSubmitChatMessage.trim()) {
      throw new Error('afterSubmitChatMessage is required when form collection is enabled');
    }

    configSection.isForm = true;
    configSection.formStructure = './config/formFormat.json';
    if (hasWebhook) {
      configSection.formCompletionWebhook = formData.formCompletionWebhook;
    }
    configSection.afterSubmitChatMessage = formData.afterSubmitChatMessage;
    // formSendHome flag - URL will be injected by deployer
    if (hasFormSendHome) {
      configSection.formSendHome = true;
    }
  }

  // Add calendar flag for appointments flow
  if (isAppointments) {
    configSection.isCalendar = true;
    configSection.calendarConfig = './config/calendarConfig.json';
  }

  // Add triage flag for modular triage flow
  if (isModularTriage) {
    configSection.isTriage = true;
    configSection.triageRoutes = './config/triageRoutes.json';
  }

  return {
    // Config section (UI settings)
    config: configSection,

    // LLM section
    llm: buildLLMConfig(
      formData.provider,
      formData.apiKey,
      formData.model,
      formData.llmSettings || {}
    ),

    // Extra fields for deployer (not part of config.json)
    objective: formData.objective,
    botSummary: formData.botSummary || undefined,
    skipRag: isSkipRag || undefined,
    formStructure: injectConsentToTCField(
      formData.formStructure?.generatedJson,
      formData.termsAndConditions
    ) || undefined,
    formCompletionWebhook: formData.formCompletionWebhook || undefined,
    afterSubmitChatMessage: formData.afterSubmitChatMessage || undefined,
    formSendHome: formData.formSendHome || undefined, // Deployer will inject URL

    // Triage-specific: store routes for modular flow edit mode
    triageRoutes: isModularTriage ? formData.triageRoutes : undefined,

    // Appointments-specific: store destinations for edit mode
    appointmentDestinations: isAppointments ? formData.appointmentDestinations : undefined
  };
}

/**
 * Reverse buildDeploymentConfig - converts stored config back to form state
 * Used for cloning/editing existing deployments
 *
 * @param {Object} config - Deployment config from database
 * @returns {Object} Form data suitable for ConfigForm
 */
export function parseDeploymentConfig(config) {
  const provider = config.llm.provider;
  const providerConfig = config.llm[provider];

  // For Bedrock, apiKey is JSON credentials; for others it's the key itself
  let apiKey = '';
  let model = providerConfig.model;
  if (provider === 'bedrock') {
    apiKey = JSON.stringify({
      region: providerConfig.region,
      useIamRole: providerConfig.useIamRole,
      accessKeyId: providerConfig.accessKeyId,
      secretAccessKey: providerConfig.secretAccessKey,
    });
    // Strip geographic prefix from model ID so it matches dropdown options
    model = stripBedrockModelPrefix(model);
  } else {
    apiKey = providerConfig.apiKey || '';
  }

  return {
    // Bot Identity
    botName: config.config.name,
    objective: config.objective || '',
    firstMessage: config.config.firstMessage,

    // LLM Configuration
    provider,
    model,
    apiKey,

    // Form Structure (if it exists)
    formStructure: config.formStructure ? {
      naturalLanguageInput: '', // Not stored, will be empty
      generatedJson: config.formStructure
    } : undefined,

    // Form Collection Settings
    formCompletionWebhook: config.formCompletionWebhook || '',
    afterSubmitChatMessage: config.afterSubmitChatMessage || '',
    formSendHome: config.formSendHome || false,
    termsAndConditions: extractTermsFromFormStructure(config.formStructure),

    skipRag: config.skipRag || false,

    // UI Settings
    uiSettings: {
      chatDisplayName: config.config.chatDisplayName || 'Bot',
      placeholder: config.config.placeholder || 'Type your message...',
    },

    // Suggested Prompts
    suggestedPrompts: config.config.suggestedPrompts || [],

    // Triage Destinations (for triage flow edit mode)
    triageDestinations: config.triageDestinations || [],

    // Appointment Destinations (for appointments flow edit mode)
    appointmentDestinations: config.appointmentDestinations || []
  };
}

/**
 * Parse modular deployment config - reconstructs ModularWizardContext state
 * Used for editing modular bots
 *
 * @param {Object} config - Deployment config from database (with _modular metadata)
 * @param {Object} [options]
 * @param {boolean} [options.hasStoredApiKey] - From the GET endpoint; the
 *   config has been credential-redacted, so the wizard relies on this flag
 *   to know a key is on file and gate the credential requirement.
 * @returns {Object} State suitable for ModularWizardProvider initialData
 */
export function parseModularDeploymentConfig(config, options = {}) {
  // Extract modular metadata (persisted by /api/deploy)
  const modularMeta = config._modular || {};
  const enabledProtocols = modularMeta.enabledProtocols || {
    // Infer protocols from config if metadata not available (legacy fallback)
    knowledge: !config.skipRag,
    formGathering: !!config.formStructure || !!config.config?.isForm,
    appointments: (config.appointmentDestinations?.length > 0) || !!config.config?.isCalendar,
    triage: (config.triageRoutes?.length > 0) || !!config.config?.isTriage,
  };

  // Compute core fields (handles Bedrock vs standard providers)
  const coreProvider = config.llm?.provider || 'anthropic';
  const coreProviderConfig = config.llm?.[coreProvider] || {};
  let coreApiKey = '';
  let coreModel = coreProviderConfig.model || '';
  if (coreProvider === 'bedrock') {
    coreApiKey = JSON.stringify({
      region: coreProviderConfig.region,
      useIamRole: coreProviderConfig.useIamRole,
      accessKeyId: coreProviderConfig.accessKeyId,
      secretAccessKey: coreProviderConfig.secretAccessKey,
    });
    // Strip geographic prefix from model ID so it matches dropdown options
    coreModel = stripBedrockModelPrefix(coreModel);
  } else {
    coreApiKey = coreProviderConfig.apiKey || '';
  }

  return {
    // Protocol toggles
    enabledProtocols,

    // Core fields
    core: {
      provider: coreProvider,
      model: coreModel,
      apiKey: coreApiKey,
      apiKeyId: null,
      hasStoredApiKey: !!options.hasStoredApiKey,
      botName: config.config?.name || '',
      objective: config.objective || '',
      botSummary: config.botSummary || '',
    },

    // Identity fields
    identity: {
      firstMessage: config.config?.firstMessage || '',
      chatDisplayName: config.config?.chatDisplayName || 'Bot',
      placeholder: config.config?.placeholder || 'Type your message...',
      suggestedPrompts: config.config?.suggestedPrompts || [],
    },

    // Protocol-specific data
    protocolData: {
      knowledge: {
        skipRag: config.skipRag || false,
        documents: [], // Documents need to be fetched separately by ID
        embeddings: config._modular?.embeddings || config.embeddings || null,
      },
      formGathering: {
        formLocale: 'en-US',
        formStructureInput: '', // Not stored
        generatedFormJson: config.formStructure ? JSON.stringify(config.formStructure, null, 2) : null,
        formCompletionWebhook: config.formCompletionWebhook || config.config?.formCompletionWebhook || '',
        afterSubmitChatMessage: config.afterSubmitChatMessage || config.config?.afterSubmitChatMessage || '',
        formSendHome: config.formSendHome || config.config?.formSendHome || false,
        termsAndConditions: extractTermsFromFormStructure(config.formStructure),
      },
      appointments: {
        destinations: config.appointmentDestinations || [],
      },
      triage: {
        routes: config.triageRoutes || [],
      },
    },

    // Deployment config reference
    deploymentConfig: null,
  };
}

/**
 * Detect if a deployment config is from the modular paradigm
 * @param {Object} config - Deployment config from database
 * @returns {boolean} True if this is a modular deployment
 */
export function isModularDeployment(config) {
  return config?._modular?.paradigm === 'modular';
}

/**
 * Validate form structure JSON
 */
function validateFormStructure(formStructure) {
  if (!formStructure || typeof formStructure !== 'object') {
    return 'Form structure must be a valid object';
  }

  if (!Array.isArray(formStructure.sections) || formStructure.sections.length === 0) {
    return 'Form structure must have at least one section';
  }

  // Validate each section
  for (let i = 0; i < formStructure.sections.length; i++) {
    const section = formStructure.sections[i];

    if (!section.id) {
      return `Section ${i + 1} is missing an id`;
    }

    if (!section.label) {
      return `Section ${i + 1} is missing a label`;
    }

    if (!Array.isArray(section.fields) || section.fields.length === 0) {
      return `Section "${section.label}" must have at least one field`;
    }

    // Validate each field
    for (let j = 0; j < section.fields.length; j++) {
      const field = section.fields[j];

      if (!field.id) {
        return `Field ${j + 1} in section "${section.label}" is missing an id`;
      }

      if (!field.label) {
        return `Field "${field.id}" in section "${section.label}" is missing a label`;
      }

      if (!field.type) {
        return `Field "${field.id}" in section "${section.label}" is missing a type`;
      }

      // Set default value for required if not provided
      if (field.required === undefined) {
        field.required = false;
      } else if (typeof field.required !== 'boolean') {
        return `Field "${field.id}" in section "${section.label}" must have a required boolean`;
      }

      // Validate dropdown has options
      if (field.type === 'dropdown' && (!Array.isArray(field.options) || field.options.length === 0)) {
        return `Field "${field.id}" in section "${section.label}" is a dropdown but has no options`;
      }
    }
  }

  return null; // Valid
}

/**
 * Validate deployment config
 */
export function validateDeploymentConfig(config) {
  const errors = [];

  // Check config section
  if (!config.config?.name) errors.push('Bot name is required');
  if (!config.config?.firstMessage) errors.push('First message is required');

  // Check LLM section
  if (!config.llm?.provider) errors.push('LLM provider is required');
  if (!config.llm[config.llm.provider]?.model) errors.push('Model is required');

  // Validate credentials based on provider
  const provider = config.llm?.provider;
  const providerConfig = config.llm?.[provider];
  if (provider === 'bedrock') {
    // Bedrock stores credentials as separate fields (accessKeyId, secretAccessKey, useIamRole)
    if (!providerConfig?.useIamRole && (!providerConfig?.accessKeyId || !providerConfig?.secretAccessKey)) {
      errors.push('AWS Access Key ID and Secret Access Key are required (or enable IAM Role)');
    }
  } else {
    // Standard API key validation for other providers
    if (!providerConfig?.apiKey) errors.push('API key is required');
  }

  // Check mandatory custom fields
  if (!config.objective) errors.push('Objective is required');

  // Validate form structure (optional, but if provided must be valid)
  if (config.formStructure) {
    const formError = validateFormStructure(config.formStructure);
    if (formError) {
      errors.push(`Form structure validation failed: ${formError}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}