// Canonical envelope shape — mirror of lite-template/helper/envelope-schema.js.
// Two npm packages, no shared layer; keep in sync.
//
// canonical source: lite-template/helper/envelope-schema.js
// mirror:           control/lib/envelope-schema.js

// OpenAI structured outputs (strict mode) requires every property in
// `required` and forbids `additionalProperties: true`. See the canonical
// source for full rationale; mirror is kept in sync.
export function toStrictEnvelopeSchema() {
  const fieldsValueSchema = { type: ['string', 'number', 'boolean', 'null'] };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'suggestions', 'form', 'triage', 'appointment', 'extraction'],
    properties: {
      answer:      { type: 'string' },
      suggestions: { type: 'array', items: { type: 'string' } },

      form: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['fields', 'remaining', 'complete'],
        properties: {
          fields:    { type: 'object', additionalProperties: fieldsValueSchema },
          remaining: { type: 'integer', minimum: 0 },
          complete:  { type: 'boolean' },
        },
      },

      triage: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['deploymentId', 'starterPrompt'],
        properties: {
          deploymentId:  { type: 'string' },
          starterPrompt: { type: 'string' },
        },
      },

      appointment: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['showLaunchButton', 'calendarId'],
        properties: {
          showLaunchButton: { type: 'boolean' },
          calendarId:       { type: 'string' },
        },
      },

      extraction: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['fields', 'confidence', 'notes', 'showUploadButton'],
        properties: {
          fields:           { type: 'object', additionalProperties: fieldsValueSchema },
          confidence:       { type: 'string', enum: ['high', 'medium', 'low'] },
          notes:            { type: 'string' },
          showUploadButton: { type: 'boolean' },
        },
      },
    },
  };
}

export const ENVELOPE_SCHEMA = {
  type: 'object',
  required: ['answer'],
  additionalProperties: false,
  properties: {
    answer:      { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },

    form: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fields:    { type: 'object', additionalProperties: true },
        remaining: { type: 'integer', minimum: 0 },
        complete:  { type: 'boolean' },
      },
    },

    triage: {
      type: 'object',
      additionalProperties: false,
      properties: {
        deploymentId:  { type: 'string' },
        starterPrompt: { type: 'string' },
      },
    },

    appointment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        showLaunchButton: { type: 'boolean' },
        calendarId:       { type: 'string' },
      },
    },

    extraction: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fields:           { type: 'object', additionalProperties: true },
        confidence:       { type: 'string', enum: ['high', 'medium', 'low'] },
        notes:            { type: 'string' },
        showUploadButton: { type: 'boolean' },
      },
    },
  },
};
