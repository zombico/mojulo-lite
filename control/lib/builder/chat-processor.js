/**
 * Chat Processor for Modular Bot Creation
 *
 * Processes user messages and generates contextual responses.
 * Uses rule-based intent detection with optional LLM enhancement.
 */

import {
  toggleProtocol,
  saveCoreConfig,
  saveIdentityConfig,
  saveProtocolConfig,
} from './index.js';

// Message types
const MESSAGE_TYPES = {
  BOT_TEXT: 'bot_text',
  BOT_QUESTION: 'bot_question',
  BOT_STEP_CARD: 'bot_step_card',
  BOT_CONFIRMATION: 'bot_confirmation',
  BOT_SUCCESS: 'bot_success',
  BOT_ERROR: 'bot_error',
};

// Intent patterns
const INTENT_PATTERNS = {
  // Protocol mentions
  knowledge: [/knowledge/i, /rag/i, /document/i, /faq/i, /answer.*question/i, /search/i],
  formGathering: [/form/i, /collect/i, /gather/i, /information/i, /lead/i, /contact/i],
  appointments: [/appointment/i, /book/i, /schedule/i, /calendar/i, /meeting/i],

  // Action intents
  deploy: [/deploy/i, /launch/i, /publish/i, /go live/i, /start/i, /create bot/i],
  confirm: [/^yes$/i, /confirm/i, /correct/i, /right/i, /looks? good/i, /^ok$/i, /^yep$/i],
  deny: [/^no$/i, /cancel/i, /wrong/i, /change/i, /redo/i, /different/i],

  // Setup intents
  setup_core: [/provider/i, /model/i, /name.*bot/i, /bot.*name/i, /core.*config/i],
  setup_identity: [/identity/i, /personality/i, /objective/i, /first message/i, /greeting/i],
  setup_protocols: [/capabilities/i, /protocols/i, /what.*can.*do/i, /choose.*features/i],
  setup_knowledge: [/configure.*knowledge/i, /setup.*knowledge/i, /knowledge.*config/i, /rag.*config/i],
  setup_forms: [/configure.*form/i, /setup.*form/i, /form.*config/i, /form.*collection/i],
  setup_appointments: [/configure.*appointment/i, /setup.*appointment/i, /appointment.*config/i, /calendar.*config/i],
};

// Protocol descriptions
const PROTOCOL_INFO = {
  knowledge: {
    name: 'Knowledge Base',
    description: 'Answer questions from your documents using RAG',
  },
  formGathering: {
    name: 'Form Collection',
    description: 'Gather information through conversational forms',
  },
  appointments: {
    name: 'Appointments',
    description: 'Allow users to book calendar appointments',
  },
};

/**
 * Process a chat message and generate response
 * @param {Object} params - Processing parameters
 * @param {Object} params.session - Current session
 * @param {string} params.userId - User ID
 * @param {string} params.message - User message
 * @param {string} params.messageType - Message type (text, selection, confirmation)
 * @param {Object} params.context - Additional context
 * @returns {Promise<{ messages: Array, sessionUpdate?: Object }>}
 */
export async function processChatMessage({
  session,
  userId,
  message,
  messageType,
  context,
}) {
  const messages = [];
  let sessionUpdate = null;

  // Detect intent
  const intent = detectIntent(message);
  const protocols = detectProtocols(message);

  // Handle based on message type and intent
  if (messageType === 'confirmation') {
    return handleConfirmation(message, session, userId, context);
  }

  if (messageType === 'selection') {
    return handleSelection(message, session, userId, context);
  }

  // Handle protocol detection
  if (protocols.length > 0) {
    return handleProtocolDetection(protocols, session, userId, message);
  }

  // Handle specific intents
  if (intent === 'deploy') {
    return handleDeployIntent(session, userId);
  }

  if (intent === 'setup_core') {
    return handleCoreSetupIntent(session);
  }

  if (intent === 'setup_identity') {
    return handleIdentitySetupIntent(session);
  }

  if (intent === 'setup_protocols') {
    return handleProtocolsSetupIntent(session);
  }

  if (intent === 'setup_knowledge') {
    return handleKnowledgeSetupIntent(session);
  }

  if (intent === 'setup_forms') {
    return handleFormsSetupIntent(session);
  }

  if (intent === 'setup_appointments') {
    return handleAppointmentsSetupIntent(session);
  }

  // Default: Analyze message and suggest next step
  return suggestNextStep(session, message);
}

/**
 * Detect protocols mentioned in message
 */
function detectProtocols(message) {
  const detected = [];

  for (const [protocol, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (['knowledge', 'formGathering', 'appointments'].includes(protocol)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          detected.push(protocol);
          break;
        }
      }
    }
  }

  return [...new Set(detected)];
}

/**
 * Detect user intent
 */
function detectIntent(message) {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (!['knowledge', 'formGathering', 'appointments'].includes(intent)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          return intent;
        }
      }
    }
  }
  return null;
}

/**
 * Handle protocol detection
 */
async function handleProtocolDetection(protocols, session, userId, message) {
  const messages = [];
  const enabledProtocols = session.enabledProtocols || {};

  // Build protocol description
  const protocolList = protocols
    .map((p) => `**${PROTOCOL_INFO[p]?.name || p}**: ${PROTOCOL_INFO[p]?.description || ''}`)
    .join('\n');

  messages.push({
    type: MESSAGE_TYPES.BOT_TEXT,
    content: `I'll set up your bot with these capabilities:\n\n${protocolList}`,
  });

  // Show protocol selection card for confirmation
  messages.push({
    type: MESSAGE_TYPES.BOT_STEP_CARD,
    content: null,
    data: {
      step: 'protocols',
      knowledge: protocols.includes('knowledge'),
      formGathering: protocols.includes('formGathering'),
      appointments: protocols.includes('appointments'),
    },
  });

  return { messages };
}

/**
 * Handle confirmation responses
 */
async function handleConfirmation(message, session, userId, context) {
  const isConfirmed = /^(yes|confirm|correct|right|ok|yep)/i.test(message);

  if (isConfirmed) {
    // Move to next step based on current state
    return suggestNextStep(session, 'Confirmed! Let\'s continue.');
  }

  return {
    messages: [
      {
        type: MESSAGE_TYPES.BOT_TEXT,
        content: "No problem! What would you like to change?",
      },
    ],
  };
}

/**
 * Handle selection responses
 */
async function handleSelection(selection, session, userId, context) {
  // Just acknowledge and continue
  return suggestNextStep(session, selection);
}

/**
 * Handle deploy intent
 */
async function handleDeployIntent(session, userId) {
  const messages = [];
  const enabledProtocols = session.enabledProtocols || {};
  const protocolConfigs = session.protocolConfigs || {};

  // Check if ready to deploy
  if (!session.coreConfig?.botName) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Before deploying, we need to set up some basics. Let's start with the core configuration.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'core' },
    });
    return { messages };
  }

  // Check if any protocols are enabled
  const hasProtocols = Object.values(enabledProtocols).some((v) => v);
  if (!hasProtocols) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Before deploying, we need to choose what your bot can do.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'protocols' },
    });
    return { messages };
  }

  if (!session.identityConfig?.objective) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "We need to define your bot's identity before deploying.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'identity' },
    });
    return { messages };
  }

  // Check if any enabled protocols need configuration
  if (enabledProtocols.knowledge && !protocolConfigs.knowledge) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Before deploying, let's configure the Knowledge Base.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'knowledge' },
    });
    return { messages };
  }

  if (enabledProtocols.formGathering && !protocolConfigs.formGathering) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Before deploying, let's set up Form Collection.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'formGathering' },
    });
    return { messages };
  }

  if (enabledProtocols.appointments && !protocolConfigs.appointments) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Before deploying, let's configure Appointments.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'appointments' },
    });
    return { messages };
  }

  // Ready to deploy
  const protocolNames = Object.entries(enabledProtocols)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => PROTOCOL_INFO[name]?.name || name);

  messages.push({
    type: MESSAGE_TYPES.BOT_TEXT,
    content: "Everything looks ready! Here's a summary of your bot:",
  });

  messages.push({
    type: MESSAGE_TYPES.BOT_STEP_CARD,
    content: null,
    data: {
      step: 'deploy',
      botName: session.coreConfig.botName,
      protocols: protocolNames,
      provider: session.coreConfig.provider || 'Anthropic',
      model: session.coreConfig.model,
    },
  });

  return { messages };
}

/**
 * Handle core setup intent
 */
async function handleCoreSetupIntent(session) {
  return {
    messages: [
      {
        type: MESSAGE_TYPES.BOT_TEXT,
        content: "Let's configure the core settings for your bot.",
      },
      {
        type: MESSAGE_TYPES.BOT_STEP_CARD,
        content: null,
        data: {
          step: 'core',
          provider: session.coreConfig?.provider,
          model: session.coreConfig?.model,
          botName: session.coreConfig?.botName,
        },
      },
    ],
  };
}

/**
 * Handle identity setup intent
 */
async function handleIdentitySetupIntent(session) {
  return {
    messages: [
      {
        type: MESSAGE_TYPES.BOT_TEXT,
        content: "Let's define your bot's personality and behavior.",
      },
      {
        type: MESSAGE_TYPES.BOT_STEP_CARD,
        content: null,
        data: {
          step: 'identity',
          objective: session.identityConfig?.objective,
          firstMessage: session.identityConfig?.firstMessage,
          displayName: session.identityConfig?.displayName,
        },
      },
    ],
  };
}

/**
 * Handle protocols setup intent
 */
async function handleProtocolsSetupIntent(session) {
  const enabledProtocols = session.enabledProtocols || {};
  return {
    messages: [
      {
        type: MESSAGE_TYPES.BOT_TEXT,
        content: "Let's choose what capabilities your bot should have.",
      },
      {
        type: MESSAGE_TYPES.BOT_STEP_CARD,
        content: null,
        data: {
          step: 'protocols',
          knowledge: enabledProtocols.knowledge || false,
          formGathering: enabledProtocols.formGathering || false,
          appointments: enabledProtocols.appointments || false,
        },
      },
    ],
  };
}

/**
 * Handle knowledge base setup intent
 */
async function handleKnowledgeSetupIntent(session) {
  const config = session.protocolConfigs?.knowledge || {};
  return {
    messages: [
      {
        type: MESSAGE_TYPES.BOT_TEXT,
        content: "Let's configure the Knowledge Base for your bot.",
      },
      {
        type: MESSAGE_TYPES.BOT_STEP_CARD,
        content: null,
        data: {
          step: 'knowledge',
          ...config,
        },
      },
    ],
  };
}

/**
 * Handle form collection setup intent
 */
async function handleFormsSetupIntent(session) {
  const config = session.protocolConfigs?.formGathering || {};
  return {
    messages: [
      {
        type: MESSAGE_TYPES.BOT_TEXT,
        content: "Let's set up Form Collection for your bot.",
      },
      {
        type: MESSAGE_TYPES.BOT_STEP_CARD,
        content: null,
        data: {
          step: 'formGathering',
          ...config,
        },
      },
    ],
  };
}

/**
 * Handle appointments setup intent
 */
async function handleAppointmentsSetupIntent(session) {
  const config = session.protocolConfigs?.appointments || {};
  return {
    messages: [
      {
        type: MESSAGE_TYPES.BOT_TEXT,
        content: "Let's configure Appointments for your bot.",
      },
      {
        type: MESSAGE_TYPES.BOT_STEP_CARD,
        content: null,
        data: {
          step: 'appointments',
          ...config,
        },
      },
    ],
  };
}

/**
 * Suggest next step based on session state
 */
function suggestNextStep(session, userMessage = '') {
  const messages = [];

  // Check what's missing and suggest
  if (!session.coreConfig?.botName) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Great! Let's start by setting up the basics for your bot. Choose a provider, model, and give your bot a name.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'core' },
    });
    return { messages };
  }

  // Check if any protocols are enabled
  const enabledProtocols = session.enabledProtocols || {};
  const protocolConfigs = session.protocolConfigs || {};
  const hasProtocols = Object.values(enabledProtocols).some((v) => v);

  if (!hasProtocols) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Now let's choose what your bot can do. What capabilities would you like to enable?",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'protocols' },
    });
    return { messages };
  }

  if (!session.identityConfig?.objective) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Now let's define your bot's personality. What's its main objective and how should it greet users?",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: {
        step: 'identity',
        displayName: session.coreConfig?.botName,
      },
    });
    return { messages };
  }

  // Check if any enabled protocols need configuration
  // Knowledge base config
  if (enabledProtocols.knowledge && !protocolConfigs.knowledge) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Let's configure the Knowledge Base. This allows your bot to answer questions from your documents.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'knowledge' },
    });
    return { messages };
  }

  // Form gathering config
  if (enabledProtocols.formGathering && !protocolConfigs.formGathering) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Let's set up Form Collection. This allows your bot to gather information from users.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'formGathering' },
    });
    return { messages };
  }

  // Appointments config
  if (enabledProtocols.appointments && !protocolConfigs.appointments) {
    messages.push({
      type: MESSAGE_TYPES.BOT_TEXT,
      content: "Let's configure Appointments. This allows your bot to help users book appointments.",
    });
    messages.push({
      type: MESSAGE_TYPES.BOT_STEP_CARD,
      content: null,
      data: { step: 'appointments' },
    });
    return { messages };
  }

  // All basics and protocol configs done - suggest deploy
  const protocolNames = Object.entries(enabledProtocols)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => PROTOCOL_INFO[name]?.name || name);

  messages.push({
    type: MESSAGE_TYPES.BOT_TEXT,
    content: `Your bot "${session.coreConfig.botName}" is ready to deploy! It has ${protocolNames.join(', ')} capabilities.`,
  });

  messages.push({
    type: MESSAGE_TYPES.BOT_STEP_CARD,
    content: null,
    data: {
      step: 'deploy',
      botName: session.coreConfig.botName,
      protocols: protocolNames,
      provider: session.coreConfig.provider || 'Anthropic',
      model: session.coreConfig.model,
    },
  });

  return { messages };
}
