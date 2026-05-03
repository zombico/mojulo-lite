/**
 * Builder Tools for Inverted Flow
 *
 * Tool definitions for the "Claude proposes, User disposes" architecture.
 * These tools allow Claude to:
 * - Process documents and generate RAG summaries
 * - Infer user intent from context
 * - Recommend appropriate protocols
 * - Generate configurations for each protocol
 * - Compose bot identity
 * - Deploy the final bot
 */

/**
 * Tool definitions for Claude's inverted builder flow
 */
export const BUILDER_TOOLS = [
  {
    name: 'process_documents',
    description: 'Parse uploaded documents and embed them locally via the bundled multilingual-e5-small ONNX model. Call this first when documents are attached.',
    input_schema: {
      type: 'object',
      properties: {
        documentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of document IDs to process',
        },
      },
      required: ['documentIds'],
    },
  },
  {
    name: 'infer_intent',
    description: 'Analyze the user message and document digest to determine the bot type and required capabilities. Returns intent classification with confidence score.',
    input_schema: {
      type: 'object',
      properties: {
        userMessage: {
          type: 'string',
          description: 'The user\'s original message describing what they want',
        },
        domainDigest: {
          type: 'string',
          description: 'Build-time digest of processed documents (if any) — produced by process_documents',
        },
      },
      required: ['userMessage'],
    },
  },
  {
    name: 'recommend_protocols',
    description: 'Based on the inferred intent and context, recommend which protocols (Knowledge, Forms, Appointments, Triage) should be enabled. Provides reasoning for each recommendation.',
    input_schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The inferred intent (e.g., support_bot, lead_gen, appointment_scheduler)',
        },
        domainDigest: {
          type: 'string',
          description: 'Build-time digest of processed documents — produced by process_documents',
        },
        userMessage: {
          type: 'string',
          description: 'Original user message for additional context',
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'generate_form_schema',
    description: 'Generate a form schema for data collection based on the bot\'s purpose. Creates field definitions for ghost forms.',
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of what data the form should collect',
        },
        formType: {
          type: 'string',
          enum: ['lead_capture', 'support_ticket', 'feedback', 'booking_info', 'custom'],
          description: 'Type of form to generate',
        },
        locale: {
          type: 'string',
          description: 'Locale for field labels (e.g., en, es, fr)',
          default: 'en',
        },
        afterSubmitChatMessage: {
          type: 'string',
          description: 'Message shown to users after they submit the form. If not provided, a contextual message will be generated based on the form purpose.',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'generate_appointment_config',
    description: 'Generate appointment/booking configuration for calendar integrations.',
    input_schema: {
      type: 'object',
      properties: {
        domainDigest: {
          type: 'string',
          description: 'Build-time digest of documents — used to extract appointment types/services',
        },
        businessType: {
          type: 'string',
          description: 'Type of business (e.g., healthcare, salon, consulting)',
        },
        calendarProviders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Available calendar providers (google, outlook, etc.)',
        },
      },
    },
  },
  {
    name: 'generate_triage_config',
    description: 'Generate triage routing configuration for multi-bot orchestration. Defines destinations where users can be routed based on their intent. Each route has a name, description (for RAG matching), and target URL.',
    input_schema: {
      type: 'object',
      properties: {
        routes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Display name for the route (e.g., "Sales Support", "Technical Help")',
              },
              description: {
                type: 'string',
                description: 'Description of when users should be routed here - used for RAG matching (e.g., "Users asking about pricing, quotes, or purchasing")',
              },
              url: {
                type: 'string',
                description: 'Target URL to route users to',
              },
              deploymentId: {
                type: 'string',
                description: 'Optional deployment ID if routing to another bot. If not provided, will be generated from the name.',
              },
            },
            required: ['name', 'description', 'url'],
          },
          description: 'Array of routing destinations',
        },
        domainDigest: {
          type: 'string',
          description: 'Build-time digest of documents — used to infer appropriate routes',
        },
        userMessage: {
          type: 'string',
          description: 'Original user message for context about routing needs',
        },
      },
      required: ['routes'],
    },
  },
  {
    name: 'compose_identity',
    description: 'Generate the bot\'s identity including name, objective, first message, and suggested prompts. Pass userMessage and domainDigest for contextual LLM-generated identity.',
    input_schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The inferred bot intent/type',
        },
        domainDigest: {
          type: 'string',
          description: 'Build-time document digest — used to generate contextual firstMessage and objective',
        },
        userMessage: {
          type: 'string',
          description: 'The original user message describing what they want - used with domainDigest to generate contextual identity',
        },
        organizationName: {
          type: 'string',
          description: 'Name of the organization deploying the bot',
        },
        enabledProtocols: {
          type: 'object',
          description: 'Which protocols are enabled',
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'set_suggested_prompts',
    description: 'Set the suggested prompts for the bot. Call this AFTER compose_identity to provide localized prompts in the same language as the documents/user. Generate 3 short, specific prompts based on the document content.',
    input_schema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 5,
          description: 'Array of 3 suggested prompts in the SAME LANGUAGE as the documents. Each prompt should be short (max 8 words), specific to the content, and start with an action word.',
        },
      },
      required: ['prompts'],
    },
  },
  {
    name: 'generate_bot_summary',
    description: 'Generate a summarized description of the bot, will be used as meta-data. Call this after all configurations are complete, before deployment. The summary describes what the bot does, what knowledge it has, and its capabilities.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'save_modular_bot',
    description:
      "Save the bot's composed configuration to a deployment row in SQLite. Only call after user confirms the recommended protocols. This does NOT build the artifact — the user clicks 'Build & Download' afterward.",
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The modular session ID',
        },
        confirmedProtocols: {
          type: 'object',
          description: 'User-confirmed protocol selections',
        },
      },
      required: ['sessionId', 'confirmedProtocols'],
    },
  },
];

/**
 * Tool name to display label mapping
 */
export const TOOL_LABELS = {
  process_documents: 'Processing documents',
  infer_intent: 'Analyzing intent',
  recommend_protocols: 'Recommending protocols',
  generate_form_schema: 'Generating form',
  generate_appointment_config: 'Configuring appointments',
  generate_triage_config: 'Configuring triage routes',
  compose_identity: 'Composing identity',
  set_suggested_prompts: 'Setting suggested prompts',
  generate_bot_summary: 'Generating bot summary',
  save_modular_bot: 'Saving bot configuration',
};

/**
 * Tool name to icon mapping (for UI)
 */
export const TOOL_ICONS = {
  process_documents: 'document',
  infer_intent: 'target',
  recommend_protocols: 'puzzle',
  generate_form_schema: 'form',
  generate_appointment_config: 'calendar',
  generate_triage_config: 'split',
  compose_identity: 'robot',
  set_suggested_prompts: 'message-square',
  generate_bot_summary: 'sparkles',
  save_modular_bot: 'save',
};

/**
 * Get tool definition by name
 */
export function getToolByName(name) {
  return BUILDER_TOOLS.find(tool => tool.name === name);
}

/**
 * Validate tool input against schema
 */
export function validateToolInput(toolName, input) {
  const tool = getToolByName(toolName);
  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const schema = tool.input_schema;
  const required = schema.required || [];

  for (const field of required) {
    if (input[field] === undefined || input[field] === null) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  return { valid: true };
}
