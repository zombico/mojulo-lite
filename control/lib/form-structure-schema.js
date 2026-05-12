// Canonical form-structure shape for the AI-powered form generator.
// Consumed by generateStructured() in control/lib/llm-providers.js — the
// OpenAI / Anthropic / Bedrock adapters all key off this artifact.
//
// Two variants:
//   FORM_STRUCTURE_SCHEMA          — canonical; used by Anthropic tool_use
//                                    and Bedrock Converse toolSpec, whose
//                                    JSON-schema validators are permissive
//   toStrictFormStructureSchema()  — OpenAI strict-mode-compatible derivative:
//                                    every property in `required`, no
//                                    `additionalProperties: true`, optional
//                                    keys typed as ["X", "null"]
//
// Control-plane only. No mirror in lite-template/ — the bot runtime does
// not generate forms.

const FIELD_TYPES = [
  'text', 'email', 'tel', 'url', 'date', 'number',
  'dropdown', 'checkbox', 'textarea', 'radio',
];

const INPUT_MODES = ['numeric', 'tel', 'email', 'decimal', 'url'];

const CONDITION_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['branch'],
      properties: {
        branch: { type: 'string' },
        not:    { type: 'boolean' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['logic', 'branches'],
      properties: {
        logic:    { type: 'string', enum: ['and', 'or'] },
        branches: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
    },
  ],
};

const FIELD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'type', 'required'],
  properties: {
    id:           { type: 'string' },
    label:        { type: 'string' },
    type:         { type: 'string', enum: FIELD_TYPES },
    required:     { type: 'boolean' },
    placeholder:  { type: 'string' },
    pattern:      { type: 'string' },
    patternError: { type: 'string' },
    autocomplete: { type: 'string' },
    inputMode:    { type: 'string', enum: INPUT_MODES },
    pii:          { type: 'boolean' },
    sensitive:    { type: 'boolean' },
    helpText:     { type: 'string' },
    maxLength:    { type: 'integer', minimum: 1 },
    rows:         { type: 'integer', minimum: 1 },
    min:          { type: 'number' },
    max:          { type: 'number' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['value', 'label'],
        properties: {
          value: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
    condition: CONDITION_SCHEMA,
  },
};

const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'fields'],
  properties: {
    id:        { type: 'string' },
    label:     { type: 'string' },
    fields:    { type: 'array', items: FIELD_SCHEMA, minItems: 1 },
    condition: CONDITION_SCHEMA,
  },
};

export const FORM_STRUCTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sections'],
  properties: {
    branches: { type: 'array', items: { type: 'string' } },
    sections: { type: 'array', items: SECTION_SCHEMA, minItems: 1 },
  },
};

// OpenAI structured outputs (strict mode) requires:
//   - every key in `properties` listed in `required`
//   - no `additionalProperties: true` — must be `false` or a schema
//   - `oneOf` only at the top level of a property (not as the property value
//     of another property) — we collapse CONDITION_SCHEMA into a single
//     object with all four keys nullable and let the model pick the shape
// Optional keys become ["X", "null"] so the model can return null when unset.
// The route then strips nulls before responding so downstream consumers see
// the canonical "absent key" shape.
export function toStrictFormStructureSchema() {
  const conditionSchema = {
    type: ['object', 'null'],
    additionalProperties: false,
    required: ['branch', 'not', 'logic', 'branches'],
    properties: {
      branch:   { type: ['string', 'null'] },
      not:      { type: ['boolean', 'null'] },
      logic:    { type: ['string', 'null'], enum: ['and', 'or', null] },
      branches: { type: ['array', 'null'], items: { type: 'string' } },
    },
  };

  const fieldSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'id', 'label', 'type', 'required',
      'placeholder', 'pattern', 'patternError', 'autocomplete', 'inputMode',
      'pii', 'sensitive', 'helpText', 'maxLength', 'rows', 'min', 'max',
      'options', 'condition',
    ],
    properties: {
      id:           { type: 'string' },
      label:        { type: 'string' },
      type:         { type: 'string', enum: FIELD_TYPES },
      required:     { type: 'boolean' },
      placeholder:  { type: ['string', 'null'] },
      pattern:      { type: ['string', 'null'] },
      patternError: { type: ['string', 'null'] },
      autocomplete: { type: ['string', 'null'] },
      inputMode:    { type: ['string', 'null'], enum: [...INPUT_MODES, null] },
      pii:          { type: ['boolean', 'null'] },
      sensitive:    { type: ['boolean', 'null'] },
      helpText:     { type: ['string', 'null'] },
      maxLength:    { type: ['integer', 'null'] },
      rows:         { type: ['integer', 'null'] },
      min:          { type: ['number', 'null'] },
      max:          { type: ['number', 'null'] },
      options: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'label'],
          properties: {
            value: { type: 'string' },
            label: { type: 'string' },
          },
        },
      },
      condition: conditionSchema,
    },
  };

  const sectionSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'label', 'fields', 'condition'],
    properties: {
      id:        { type: 'string' },
      label:     { type: 'string' },
      fields:    { type: 'array', items: fieldSchema },
      condition: conditionSchema,
    },
  };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['branches', 'sections'],
    properties: {
      branches: { type: ['array', 'null'], items: { type: 'string' } },
      sections: { type: 'array', items: sectionSchema },
    },
  };
}
