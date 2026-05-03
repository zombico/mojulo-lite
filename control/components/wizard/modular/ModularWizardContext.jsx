'use client';

import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { LLM_PROVIDERS } from '@/lib/llm-providers';

const ModularWizardContext = createContext(null);

/**
 * Step ID to protocol mapping
 */
const STEP_TO_PROTOCOL = {
  'knowledge': 'knowledge',
  'form-gathering': 'formGathering',
  'appointments': 'appointments',
  'triage': 'triage',
};

/**
 * Protocol validators
 */
const PROTOCOL_VALIDATORS = {
  knowledge: (data, formData) => {
    // All builds are vector-only — process_documents embeds the corpus
    // locally and ships embeddings.json in the artifact. Documents are the
    // only valid source, and embedding must succeed before save.
    if (formData.skipRag) {
      return { valid: true };
    }
    const hasDocs = data.documents && data.documents.length > 0;
    if (!hasDocs) {
      return { valid: false, error: 'At least one document is required' };
    }
    if (!data.embeddings?.storageKey) {
      return {
        valid: false,
        error: 'Generate embeddings before saving — open the Embeddings tab to run it.',
      };
    }
    return { valid: true };
  },

  formGathering: (data) => {
    if (!data.generatedFormJson) {
      return { valid: false, error: 'Form structure required' };
    }
    try {
      JSON.parse(data.generatedFormJson);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid form JSON' };
    }
  },

  appointments: (data) => {
    if (!data.destinations || data.destinations.length === 0) {
      return { valid: false, error: 'At least one calendar required' };
    }
    for (const dest of data.destinations) {
      if (!dest.id || !dest.provider || !dest.popupUrl) {
        return { valid: false, error: 'All calendars must have id, provider, and URL' };
      }
    }
    return { valid: true };
  },

  triage: (data) => {
    if (!data.routes || data.routes.length === 0) {
      return { valid: false, error: 'At least one routing destination required' };
    }
    for (const route of data.routes) {
      if (!route.deploymentId || !route.name || !route.description || !route.url) {
        return { valid: false, error: 'All routes must have name, description, and URL' };
      }
    }
    return { valid: true };
  },
};

/**
 * Generate steps dynamically based on enabled protocols
 */
function generateSteps(enabledProtocols) {
  const steps = [
    { id: 'core', number: 1, section: 'Bot Setup', required: true },
    { id: 'protocols', number: 2, section: 'Capabilities', required: true },
    { id: 'identity', number: 3, section: 'Identity', required: true },
  ];

  let stepNumber = 4;

  // Add protocol steps based on selections
  if (enabledProtocols.knowledge) {
    steps.push({
      id: 'knowledge',
      number: stepNumber++,
      section: 'Knowledge Base',
      protocol: 'knowledge',
    });
  }

  if (enabledProtocols.formGathering) {
    steps.push({
      id: 'form-gathering',
      number: stepNumber++,
      section: 'Form Collection',
      protocol: 'formGathering',
    });
  }

  if (enabledProtocols.appointments) {
    steps.push({
      id: 'appointments',
      number: stepNumber++,
      section: 'Appointments',
      protocol: 'appointments',
    });
  }

  if (enabledProtocols.triage) {
    steps.push({
      id: 'triage',
      number: stepNumber++,
      section: 'Routing',
      protocol: 'triage',
    });
  }

  // Deploy is always last
  steps.push({
    id: 'deploy',
    number: stepNumber,
    section: 'Preview',
    required: true,
  });

  return steps;
}

/**
 * Initial state for the modular wizard
 */
const createInitialState = () => ({
  // Protocol toggles (user selections)
  enabledProtocols: {
    knowledge: false,
    formGathering: false,
    appointments: false,
    triage: false,
  },

  // Core fields (always required)
  core: {
    provider: 'anthropic',
    model: LLM_PROVIDERS.anthropic.defaultModel,
    apiKey: '',
    botName: '',
    objective: '',
    botSummary: '',
  },

  // Identity fields
  identity: {
    firstMessage: '',
    chatDisplayName: '',
    placeholder: '',
    suggestedPrompts: [],
  },

  // Protocol-specific data (populated when protocol enabled)
  protocolData: {
    knowledge: {
      skipRag: false,
      documents: [],
      embeddings: null, // { storageKey, wizardToken, model, chunkCount, generatedAt, sourceDocuments }
    },
    formGathering: {
      formLocale: 'en-US',
      formStructureInput: '',
      generatedFormJson: null,
      formCompletionWebhook: '',
      afterSubmitChatMessage: '',
      formSendHome: true,
      termsAndConditions: '',
    },
    appointments: {
      destinations: [],
    },
    triage: {
      routes: [],
    },
  },

  // Deployment config
  deploymentConfig: null,
});

export function ModularWizardProvider({ children, initialData = null, botSpaceId = null }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [errors, setErrors] = useState({});
  const [theatreContent, setTheatreContent] = useState(null);

  // Initialize state
  const [state, setState] = useState(() => {
    if (initialData) {
      return { ...createInitialState(), ...initialData };
    }
    return createInitialState();
  });

  // Generate steps based on enabled protocols
  const steps = useMemo(() =>
    generateSteps(state.enabledProtocols),
    [state.enabledProtocols]
  );

  const maxSteps = steps.length;

  // Get step config by number
  const getStepById = useCallback((stepNumber) => {
    return steps.find(s => s.number === stepNumber) || null;
  }, [steps]);

  // Get step ID for a step number
  const getStepId = useCallback((stepNumber) => {
    const step = getStepById(stepNumber);
    return step?.id || null;
  }, [getStepById]);

  // Toggle a protocol
  const toggleProtocol = useCallback((protocolName) => {
    setState(prev => ({
      ...prev,
      enabledProtocols: {
        ...prev.enabledProtocols,
        [protocolName]: !prev.enabledProtocols[protocolName],
      },
    }));
  }, []);

  // Update core fields
  const updateCore = useCallback((updates) => {
    setState(prev => ({
      ...prev,
      core: { ...prev.core, ...updates },
    }));
  }, []);

  // Update identity fields
  const updateIdentity = useCallback((updates) => {
    setState(prev => ({
      ...prev,
      identity: { ...prev.identity, ...updates },
    }));
  }, []);

  // Update protocol-specific data
  const updateProtocolData = useCallback((protocol, updates) => {
    setState(prev => ({
      ...prev,
      protocolData: {
        ...prev.protocolData,
        [protocol]: { ...prev.protocolData[protocol], ...updates },
      },
    }));
  }, []);

  // Update deployment config
  const updateDeploymentConfig = useCallback((config) => {
    setState(prev => ({
      ...prev,
      deploymentConfig: config,
    }));
  }, []);

  // Legacy compatibility: updateFormData for existing step components
  const updateFormData = useCallback((updates) => {
    setState(prev => {
      const newState = { ...prev };

      // Map updates to appropriate state sections
      const coreFields = ['provider', 'model', 'apiKey', 'botName', 'objective', 'botSummary'];
      const identityFields = ['firstMessage', 'chatDisplayName', 'placeholder', 'suggestedPrompts'];
      const knowledgeFields = ['skipRag', 'documents', 'embeddings'];
      const formFields = ['formLocale', 'formStructureInput', 'generatedFormJson', 'formCompletionWebhook', 'afterSubmitChatMessage', 'formSendHome', 'enableFormCollection', 'termsAndConditions'];
      for (const [key, value] of Object.entries(updates)) {
        if (coreFields.includes(key)) {
          newState.core = { ...newState.core, [key]: value };
        } else if (identityFields.includes(key)) {
          newState.identity = { ...newState.identity, [key]: value };
        } else if (knowledgeFields.includes(key)) {
          newState.protocolData = {
            ...newState.protocolData,
            knowledge: { ...newState.protocolData.knowledge, [key]: value },
          };
        } else if (formFields.includes(key)) {
          newState.protocolData = {
            ...newState.protocolData,
            formGathering: { ...newState.protocolData.formGathering, [key]: value },
          };
        } else if (key === 'appointmentDestinations') {
          newState.protocolData = {
            ...newState.protocolData,
            appointments: { ...newState.protocolData.appointments, destinations: value },
          };
        } else if (key === 'triageRoutes') {
          newState.protocolData = {
            ...newState.protocolData,
            triage: { ...newState.protocolData.triage, routes: value },
          };
        } else if (key === 'uiSettings') {
          newState.identity = {
            ...newState.identity,
            chatDisplayName: value.chatDisplayName || newState.identity.chatDisplayName,
            placeholder: value.placeholder || newState.identity.placeholder,
          };
        } else if (key === 'deploymentConfig') {
          newState.deploymentConfig = value;
        }
      }

      return newState;
    });
  }, []);

  // Legacy compatibility: formData getter for existing step components
  const formData = useMemo(() => ({
    // Core fields
    ...state.core,
    // Identity fields
    ...state.identity,
    // Knowledge fields
    ...state.protocolData.knowledge,
    // Form fields
    enableFormCollection: state.enabledProtocols.formGathering,
    ...state.protocolData.formGathering,
    // Appointment fields
    appointmentDestinations: state.protocolData.appointments.destinations,
    // Triage fields
    triageRoutes: state.protocolData.triage.routes,
    // Deployment
    deploymentConfig: state.deploymentConfig,
    // Bot Space
    botSpaceId,
    // UI Settings (for compatibility)
    uiSettings: {
      chatDisplayName: state.identity.chatDisplayName,
      placeholder: state.identity.placeholder,
    },
  }), [state, botSpaceId]);

  // Validate a step
  const validateStep = useCallback((stepNumber) => {
    const stepConfig = getStepById(stepNumber);
    if (!stepConfig) return true;

    const newErrors = {};

    switch (stepConfig.id) {
      case 'core':
        if (!state.core.botName) newErrors.botName = 'Bot Name is required';
        if (state.core.botName && state.core.botName.length > 50) {
          newErrors.botName = 'Bot Name must be 50 characters or less';
        }
        if (!state.core.provider) newErrors.provider = 'Provider is required';
        if (!state.core.model) newErrors.model = 'Model is required';
        // Validate credentials based on provider
        if (state.core.provider === 'bedrock') {
          if (!state.core.apiKey) {
            newErrors.apiKey = 'AWS credentials are required';
          } else {
            try {
              const creds = JSON.parse(state.core.apiKey);
              if (!creds.useIamRole && (!creds.accessKeyId || !creds.secretAccessKey)) {
                newErrors.apiKey = 'AWS Access Key ID and Secret Access Key are required';
              }
            } catch {
              newErrors.apiKey = 'Invalid AWS credentials format';
            }
          }
        } else if (!state.core.apiKey) {
          newErrors.apiKey = 'API Key is required';
        }
        break;

      case 'protocols':
        // At least one protocol must be enabled
        if (!state.enabledProtocols.knowledge &&
            !state.enabledProtocols.formGathering &&
            !state.enabledProtocols.appointments &&
            !state.enabledProtocols.triage) {
          newErrors.protocols = 'At least one capability must be enabled';
        }
        break;

      case 'identity':
        if (!state.core.objective) newErrors.objective = 'Objective is required';
        if (!state.identity.firstMessage) newErrors.firstMessage = 'First Message is required';
        if (!state.identity.chatDisplayName) newErrors.chatDisplayName = 'Chat Window Display Name is required';
        break;

      case 'knowledge':
        const knowledgeValidation = PROTOCOL_VALIDATORS.knowledge(
          state.protocolData.knowledge,
          { skipRag: state.protocolData.knowledge.skipRag }
        );
        if (!knowledgeValidation.valid) {
          // Embedding errors surface under the embeddings field so the form
          // can scroll to the right control; missing-docs errors go on the
          // documents field.
          const targetField = state.protocolData.knowledge.embeddings?.storageKey
            ? 'documents'
            : (state.protocolData.knowledge.documents?.length ? 'embeddings' : 'documents');
          newErrors[targetField] = knowledgeValidation.error;
        }
        break;

      case 'form-gathering':
        const formValidation = PROTOCOL_VALIDATORS.formGathering(state.protocolData.formGathering);
        if (!formValidation.valid) {
          newErrors.generatedFormJson = formValidation.error;
        }
        // Additional validation
        if (state.protocolData.formGathering.generatedFormJson) {
          if (!state.protocolData.formGathering.formCompletionWebhook && !state.protocolData.formGathering.formSendHome) {
            newErrors.formCompletionWebhook = 'Either webhook URL or "Send to Control Plane" is required';
          }
          if (!state.protocolData.formGathering.afterSubmitChatMessage) {
            newErrors.afterSubmitChatMessage = 'After-submit message is required';
          }
        }
        break;

      case 'appointments':
        const apptValidation = PROTOCOL_VALIDATORS.appointments(state.protocolData.appointments);
        if (!apptValidation.valid) {
          newErrors.appointmentDestinations = apptValidation.error;
        }
        break;

      case 'triage':
        const triageValidation = PROTOCOL_VALIDATORS.triage(state.protocolData.triage);
        if (!triageValidation.valid) {
          newErrors.triageRoutes = triageValidation.error;
        }
        break;

      case 'deploy':
        // Deploy validation happens at deployment time
        break;
    }

    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;

    if (isValid && !completedSteps.includes(stepConfig.id)) {
      setCompletedSteps(prev => [...prev, stepConfig.id]);
    }

    return isValid;
  }, [state, getStepById, completedSteps]);

  // Navigation
  const goToStep = useCallback((stepNumber) => {
    if (stepNumber >= 1 && stepNumber <= maxSteps) {
      setCurrentStep(stepNumber);
    }
  }, [maxSteps]);

  const nextStep = useCallback(() => {
    if (validateStep(currentStep)) {
      if (currentStep < maxSteps) {
        setCurrentStep(prev => prev + 1);
        return true;
      }
    }
    return false;
  }, [currentStep, maxSteps, validateStep]);

  const previousStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      setErrors({});
    }
  }, [currentStep]);

  const clearError = useCallback((fieldName) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);

  // Build deployment config for kubernetes
  const buildDeploymentConfig = useCallback(() => {
    return {
      paradigm: 'modular',
      enabledProtocols: state.enabledProtocols,
      core: state.core,
      identity: state.identity,
      protocolData: {
        knowledge: state.enabledProtocols.knowledge ? state.protocolData.knowledge : null,
        formGathering: state.enabledProtocols.formGathering ? state.protocolData.formGathering : null,
        appointments: state.enabledProtocols.appointments ? state.protocolData.appointments : null,
        triage: state.enabledProtocols.triage ? state.protocolData.triage : null,
      },
    };
  }, [state]);

  // Hydrate wizard state from a parsed deployment config (for edit mode)
  const hydrateFromConfig = useCallback((parsedConfig, documents = []) => {
    setState(prev => ({
      ...prev,
      enabledProtocols: parsedConfig.enabledProtocols || prev.enabledProtocols,
      core: {
        ...prev.core,
        ...parsedConfig.core,
      },
      identity: {
        ...prev.identity,
        ...parsedConfig.identity,
      },
      protocolData: {
        knowledge: {
          ...prev.protocolData.knowledge,
          ...parsedConfig.protocolData?.knowledge,
          documents: documents || [], // Hydrate documents from API response
        },
        formGathering: {
          ...prev.protocolData.formGathering,
          ...parsedConfig.protocolData?.formGathering,
        },
        appointments: {
          ...prev.protocolData.appointments,
          ...parsedConfig.protocolData?.appointments,
        },
        triage: {
          ...prev.protocolData.triage,
          ...parsedConfig.protocolData?.triage,
        },
      },
    }));
    // Mark all steps as completed for edit mode navigation
    setCompletedSteps(['core', 'protocols', 'identity', 'knowledge', 'form-gathering', 'appointments', 'triage']);
    console.log('[ModularWizard] State hydrated from config:', parsedConfig);
  }, []);

  // Update UI settings (legacy compatibility)
  const updateUISettings = useCallback((updates) => {
    updateIdentity(updates);
  }, [updateIdentity]);

  const value = {
    // State
    state,
    currentStep,
    completedSteps,
    errors,
    theatreContent,
    steps,
    maxSteps,
    botSpaceId,

    // Protocol management
    enabledProtocols: state.enabledProtocols,
    toggleProtocol,

    // Data updates
    updateCore,
    updateIdentity,
    updateProtocolData,
    updateDeploymentConfig,

    // Legacy compatibility
    formData,
    updateFormData,
    updateUISettings,
    flowConfig: { maxSteps, steps: steps.map(s => s.id) },
    flowType: 'modular',

    // Validation & Navigation
    validateStep,
    goToStep,
    nextStep,
    previousStep,
    clearError,
    setErrors,
    getStepId,
    getStepById,
    setTheatreContent,

    // Deployment
    buildDeploymentConfig,

    // Edit mode
    hydrateFromConfig,
  };

  return (
    <ModularWizardContext.Provider value={value}>
      {children}
    </ModularWizardContext.Provider>
  );
}

export function useModularWizard() {
  const context = useContext(ModularWizardContext);
  if (!context) {
    throw new Error('useModularWizard must be used within a ModularWizardProvider');
  }
  return context;
}

/**
 * Legacy compatibility: useWizard alias for existing step components
 * This allows existing components like Resources, BotIdentity, etc. to work
 * without modification inside the ModularWizardProvider
 */
export function useWizard() {
  const context = useContext(ModularWizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a ModularWizardProvider');
  }
  return context;
}

// Re-export for convenience
export { PROTOCOL_VALIDATORS, STEP_TO_PROTOCOL };
