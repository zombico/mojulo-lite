// Canonical envelope shape produced by every adapter and every protocol.
// One top-level key per protocol; `answer` and `suggestions` are universal.
// Used by: response-builder cartridges, fallback synthesis, client renderer,
// and Anthropic forced tool use (input_schema = ENVELOPE_SCHEMA).
//
// canonical source: lite-template/helper/envelope-schema.js
// mirror:           control/lib/envelope-schema.js — keep in sync.

const ENVELOPE_SCHEMA = {
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

module.exports = { ENVELOPE_SCHEMA };
