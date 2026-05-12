// Canonical envelope shape produced by every adapter and every protocol.
// One top-level key per protocol; `answer` and `suggestions` are universal.
// Used by: response-builder cartridges, fallback synthesis, client renderer,
// and (follow-on wave) the structured-output schemas for Anthropic/OpenAI.
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

// OpenAI structured outputs (strict mode) requires:
//   - every key in `properties` listed in `required`
//   - no `additionalProperties: true` — must be `false` or a value-schema
// We model optional protocol blocks as `["object","null"]` so the model can
// return `null` when the protocol doesn't apply, and constrain the dynamic
// field bags (form.fields, extraction.fields) to primitive values, which
// matches what the cartridges already emit in practice.
//
// Anthropic's tool-use validator accepts the canonical ENVELOPE_SCHEMA
// verbatim and does not need this transform.
function toStrictEnvelopeSchema() {
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

module.exports = { ENVELOPE_SCHEMA, toStrictEnvelopeSchema };
