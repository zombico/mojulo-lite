/**
 * Response format builder.
 *
 * Composes the JSON template the model is instructed to emit. Each protocol
 * contributes one nested object under a single top-level key; `answer` and
 * `suggestions` are universal. Mirror of the canonical envelope schema at
 * lite-template/helper/envelope-schema.js / control/lib/envelope-schema.js —
 * keep field names in sync.
 */

const CORE_TEMPLATE = {
  answer: '',
  suggestions: '[3 MAX, optional]',
};

const FORM_GATHERING_TEMPLATE = {
  form: `{
        "fields": {
            "<formFieldId>": "<value>",
            ...
        },
        "remaining": "<integer count of required fields not yet filled>",
        "complete": "<true/false>"
    }`,
};

const APPOINTMENTS_TEMPLATE = {
  appointment: `{
        "showLaunchButton": "<true/false>",
        "calendarId": "<calendar id from AVAILABLE CALENDARS>"
    }`,
};

const TRIAGE_TEMPLATE = {
  triage: `{
        "deploymentId": "<deploymentId from AVAILABLE TRIAGE ROUTES>",
        "starterPrompt": "<string to prime the receiving bot>"
    }`,
};

const OPTICAL_READ_TEMPLATE = {
  extraction: `{
        "fields": { "<idName>": "<value or empty string>", ... },
        "confidence": "<high/medium/low>",
        "notes": "<one-sentence rationale citing missing/guessed fields and image quality>",
        "showUploadButton": "<true/false>"
    }`,
};

/**
 * Builds a JSON template string with inline text descriptions.
 * Object/array literals (starting with { or [) are emitted unquoted.
 */
function buildInlineTemplate(attributes) {
  const lines = Object.entries(attributes)
    .map(([key, value]) => {
      if (value.startsWith('{') || value.startsWith('[')) {
        return `    "${key}": ${value}`;
      }
      return `    "${key}": "${value}"`;
    })
    .join(',\n');

  return `{\n${lines}\n}`;
}

/**
 * Builds the response format section based on enabled protocols.
 * Each protocol contributes exactly one top-level nested object — only
 * include a protocol's key when that protocol is contributing.
 */
async function buildResponseFormatSection(enabledProtocols) {
  const attributes = { ...CORE_TEMPLATE };

  if (enabledProtocols.formGathering) Object.assign(attributes, FORM_GATHERING_TEMPLATE);
  if (enabledProtocols.appointments)  Object.assign(attributes, APPOINTMENTS_TEMPLATE);
  if (enabledProtocols.triage)        Object.assign(attributes, TRIAGE_TEMPLATE);
  if (enabledProtocols.opticalRead)   Object.assign(attributes, OPTICAL_READ_TEMPLATE);

  const jsonTemplate = buildInlineTemplate(attributes);

  return `## RESPONSE FORMAT PROTOCOL
RESPOND ONLY IN VALID JSON.
DO NOT INCLUDE ANY TEXT BEFORE OR AFTER THE JSON OBJECT.
SEND ONLY ONE JSON BACK.
EACH PROTOCOL CONTRIBUTES ONE TOP-LEVEL KEY — ONLY EMIT A PROTOCOL'S NESTED OBJECT IF THAT PROTOCOL APPLIES TO YOUR REPLY.
## DO NOT OUTPUT ANYTHING BEFORE OR AFTER THE JSON
${jsonTemplate}`;
}

export {
  buildResponseFormatSection,
  CORE_TEMPLATE,
  FORM_GATHERING_TEMPLATE,
  APPOINTMENTS_TEMPLATE,
  TRIAGE_TEMPLATE,
  OPTICAL_READ_TEMPLATE,
};
