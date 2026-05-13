/**
 * API Route: Generate Form Structure
 * Convert natural language description into structured form JSON
 */

import { NextResponse } from 'next/server';
import { generateStructured, getDefaultModelForTask } from '@/lib/llm-providers';
import { FORM_STRUCTURE_SCHEMA, toStrictFormStructureSchema } from '@/lib/form-structure-schema';
import { getCurrentUser } from '@/lib/auth/service';
import { buildFormSchemaPrompt, isLocaleSupported, DEFAULT_LOCALE } from '@/lib/form-schema-config';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { decryptApiKey } from '@/lib/deployment-auth';

/**
 * Recursively delete keys whose value is `null`. Used after the OpenAI
 * structured-output call: strict mode forces every optional key into the
 * payload as explicit `null`, but downstream consumers (the wizard editor,
 * the form-gathering cartridge) expect the canonical shape where unset
 * optional keys are simply absent. Mutates `value` in place.
 */
function stripNullValues(value) {
  if (Array.isArray(value)) {
    for (const item of value) stripNullValues(item);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (value[key] === null) {
        delete value[key];
      } else {
        stripNullValues(value[key]);
      }
    }
  }
}

async function resolveCredential({ provider, apiKey, apiKeyId, editDeploymentId }) {
  if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0) {
    return apiKey;
  }
  if (apiKeyId) {
    const record = await ApiKeyRepository.findById(apiKeyId);
    if (!record) {
      throw new Error(`Saved API key ${apiKeyId} not found`);
    }
    if (record.provider !== provider) {
      throw new Error(
        `Saved API key provider "${record.provider}" does not match selected provider "${provider}"`
      );
    }
    return decryptApiKey(record.encryptedKey);
  }
  if (editDeploymentId) {
    const existing = await DeploymentRepository.findById(editDeploymentId);
    const block = existing?.config?.llm?.[provider];
    if (!block) return null;
    if (provider === 'bedrock') {
      const hasCreds = block.useIamRole || (block.accessKeyId && block.secretAccessKey);
      return hasCreds ? JSON.stringify(block) : null;
    }
    if (provider === 'ollama') {
      // Ollama config carries `host` instead of `apiKey`. Encode it in the
      // JSON shape that resolveOllamaHost expects downstream so the same
      // credential slot semantics apply regardless of source.
      return block.host ? JSON.stringify({ host: block.host }) : null;
    }
    return block.apiKey || null;
  }
  return null;
}

/**
 * Base prompt — semantic guidance only. The structural shape (sections /
 * fields / type enum / condition variants) is enforced by the JSON schema
 * passed to the provider's structured-output mechanism in llm-providers.js.
 * Keep this prompt focused on judgment calls the schema can't make: when to
 * group into sections, when to introduce a branch, how to name things.
 */
const BASE_FORM_PROMPT = `You are a form structure generator. Convert natural language descriptions of data collection requirements into a structured form.

**FIELD NAMING:**
- id: camelCase unique identifier (e.g., "fullName", "emailAddress")
- label: Human-readable display text (e.g., "Full Name", "Email Address")

**FIELD TYPE CHOICE:**
Pick the most specific type that fits. Prefer "email" / "tel" / "url" / "date" / "number" over generic "text" when the data is structured. Use "dropdown" for closed choices with a known list; "radio" for short closed choices the user benefits from seeing all at once; "checkbox" for booleans; "textarea" for free-form long-form input.

**OPTIONAL FIELD ATTRIBUTES:**
- placeholder: Hint text shown in empty inputs
- pattern + patternError: Regex validation and its user-facing error
- autocomplete: Browser autofill hint (e.g., "email", "tel", "postal-code")
- inputMode: Mobile keyboard hint
- pii: true if the field collects personally identifiable information
- sensitive: true for highly sensitive fields (SSN, passwords)
- helpText: Helper text under the field
- maxLength, rows, min, max: Per-type input constraints
- options: REQUIRED for "dropdown" and "radio" — array of {value, label}

**BRANCH-BASED CONDITIONAL VISIBILITY:**
Branches are named flags activated by the conversational AI at runtime. Fields and sections reference branches via "condition" to control visibility. Define every branch name in the top-level "branches" array.

Condition shapes:
- { "branch": "isHighMileage" }                              — visible when active
- { "branch": "isHighMileage", "not": true }                 — visible when NOT active
- { "logic": "and", "branches": ["isHighMileage", "isCommercialUse"] }
- { "logic": "or",  "branches": ["isHighMileage", "hasTradeIn"] }

When to add a branch:
- User mentions "if", "when", "only for", "only if", "in case of"
- Scenarios that depend on conversational context
- Use descriptive camelCase names: "isHighMileage", "hasExistingPolicy", "needsFinancing"

**SECTION GROUPING:**
- Group related fields into logical sections (3–10 fields per section)
- Sections can carry their own "condition" to show/hide an entire group`;

/**
 * Build the complete prompt with locale-specific patterns
 */
function buildFormGenerationPrompt(locale) {
  const localePrompt = buildFormSchemaPrompt(locale);

  return `${BASE_FORM_PROMPT}

${localePrompt}

Now, convert the following natural language description into a form structure:`;
}

/**
 * POST /api/generate-form
 * Generate form structure from natural language description
 */
export async function POST(request) {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to generate form structures.' },
        { status: 401 }
      );
    }

    const {
      naturalLanguageInput,
      provider = 'openai',
      model,
      apiKey,
      apiKeyId = null,
      editDeploymentId = null,
      locale,
    } = await request.json();

    // Validate inputs
    if (!naturalLanguageInput || typeof naturalLanguageInput !== 'string' || naturalLanguageInput.trim().length === 0) {
      return NextResponse.json(
        { error: 'Natural language input is required' },
        { status: 400 }
      );
    }

    // Validate provider
    const validProviders = ['openai', 'anthropic', 'bedrock', 'ollama'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }

    // Credentials may come three ways from the wizard: fresh paste (apiKey),
    // saved-key reference (apiKeyId — opaque id, plaintext stays server-side),
    // or edit-mode reuse (editDeploymentId — read the existing deployment's
    // stored config). Resolve here so the rest of the route deals with a
    // plaintext key/JSON-creds string regardless of the path the user took.
    let resolvedApiKey;
    try {
      resolvedApiKey = await resolveCredential({ provider, apiKey, apiKeyId, editDeploymentId });
    } catch (resolveError) {
      return NextResponse.json(
        { error: resolveError.message },
        { status: 400 }
      );
    }

    if (provider === 'bedrock') {
      if (!resolvedApiKey) {
        return NextResponse.json(
          { error: 'AWS credentials are required for Bedrock.' },
          { status: 400 }
        );
      }
      try {
        const creds = JSON.parse(resolvedApiKey);
        if (!creds.useIamRole && (!creds.accessKeyId || !creds.secretAccessKey)) {
          return NextResponse.json(
            { error: 'AWS Access Key ID and Secret Access Key are required (or enable IAM Role).' },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid Bedrock credentials format.' },
          { status: 400 }
        );
      }
    } else if (provider === 'ollama') {
      // Ollama needs no credential — when resolvedApiKey is null the
      // adapter falls back to LLM_PROVIDERS.ollama.defaultHost. When it's
      // set, it carries the host URL (either JSON {host} or bare URL),
      // which resolveOllamaHost normalizes inside generateStructured.
    } else if (!resolvedApiKey) {
      return NextResponse.json(
        { error: 'API key is required. Please provide your API key for the selected provider.' },
        { status: 400 }
      );
    }

    // Resolve locale (fallback to default if not provided or invalid)
    const resolvedLocale = (locale && isLocaleSupported(locale)) ? locale : DEFAULT_LOCALE;

    console.log(`Generating form structure with ${provider} for locale ${resolvedLocale}...`);

    // Build locale-aware prompt
    const formPrompt = buildFormGenerationPrompt(resolvedLocale);

    // OpenAI strict mode requires every property in `required`, so its
    // schema variant ships explicit `null` for unset optional keys. Other
    // providers' validators accept the canonical schema as-is.
    const schema = provider === 'openai'
      ? toStrictFormStructureSchema()
      : FORM_STRUCTURE_SCHEMA;

    // Form generation is schema-constrained — drop to the structured tier
    // when the wizard didn't pin a specific model. User overrides win.
    const resolvedModel = model || getDefaultModelForTask(provider, 'structured');

    const formStructure = await generateStructured(
      provider,
      naturalLanguageInput,
      resolvedApiKey,
      formPrompt,
      schema,
      resolvedModel
    );

    // Strict-mode-induced nulls would otherwise reach the wizard editor and
    // the form-gathering cartridge; normalize to the canonical "absent key"
    // shape so downstream consumers see one wire format across providers.
    if (provider === 'openai') {
      stripNullValues(formStructure);
    }

    // Return the generated form structure
    return NextResponse.json({
      success: true,
      formStructure,
      provider,
      model,
      locale: resolvedLocale
    });

  } catch (error) {
    console.error('Error generating form structure:', error);

    // Check if it's an LLM provider error
    if (error.message && (
      error.message.includes('API key') ||
      error.message.includes('authentication') ||
      error.message.includes('quota') ||
      error.message.includes('rate limit')
    )) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || 'Failed to generate form structure',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
