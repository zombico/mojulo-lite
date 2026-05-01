/**
 * API Route: Generate Form Structure
 * Convert natural language description into structured form JSON
 */

import { NextResponse } from 'next/server';
import { generateSummary } from '@/lib/llm-providers';
import { getCurrentUser } from '@/lib/auth/service';
import { buildFormSchemaPrompt, isLocaleSupported, DEFAULT_LOCALE } from '@/lib/form-schema-config';

/**
 * Base prompt - structure requirements (locale-agnostic)
 */
const BASE_FORM_PROMPT = `You are a form structure generator. Your task is to convert natural language descriptions of data collection requirements into a structured JSON format.

**IMPORTANT JSON STRUCTURE REQUIREMENTS:**
1. The output MUST be valid JSON that matches this exact schema
2. The form MUST have a "sections" array
3. Each section MUST have: "id", "label", and "fields" array
4. Each field MUST have: "id", "label", "type", and "required" boolean
5. If conditional branching is needed, include a top-level "branches" array and use "condition" on fields/sections

**SUPPORTED FIELD TYPES:**
- "text" - Single line text input
- "email" - Email input with validation
- "tel" - Phone number input
- "url" - URL input
- "date" - Date picker
- "number" - Numeric input
- "dropdown" - Select from options
- "checkbox" - Boolean checkbox
- "textarea" - Multi-line text input
- "radio" - Select one from options

**FIELD ATTRIBUTES:**
- id: camelCase unique identifier (e.g., "fullName", "emailAddress")
- label: Human-readable display text (e.g., "Full Name", "Email Address")
- type: One of the supported types above
- required: true or false
- placeholder: (optional) Placeholder text
- pattern: (optional) Regex pattern for validation
- patternError: (optional) Error message for pattern validation
- autocomplete: (optional) Browser autofill hint (e.g., "email", "tel", "postal-code")
- inputMode: (optional) Mobile keyboard type ("numeric", "tel", "email", "decimal", "url")
- pii: (optional) true if field contains personally identifiable information
- sensitive: (optional) true for highly sensitive fields (SSN, passwords)
- helpText: (optional) Helper text displayed below the field
- maxLength: (optional) Maximum character length
- rows: (optional, for textarea) Number of rows
- min/max: (optional, for number) Min/max values
- options: (required for dropdown/radio) Array of {value, label} objects
- condition: (optional) Branch condition for conditional visibility

**BRANCH-BASED CONDITIONAL VISIBILITY:**
Branches are named flags that get activated by the AI during conversation. Fields/sections reference branches to control visibility.

Top-level branches array (define all branch names used):
{
  "branches": ["isHighMileage", "isCommercialUse", "hasTradeIn"],
  "sections": [...]
}

Single Branch Condition (show when branch is active):
{ "branch": "isHighMileage" }

Negated Branch Condition (show when branch is NOT active):
{ "branch": "isHighMileage", "not": true }

Multiple Branches with AND logic (all must be active):
{ "logic": "and", "branches": ["isHighMileage", "isCommercialUse"] }

Multiple Branches with OR logic (any must be active):
{ "logic": "or", "branches": ["isHighMileage", "hasTradeIn"] }

When to Add Branches:
- User mentions "if", "when", "only for", "only if", "in case of" → create a branch
- Scenarios that depend on conversational context
- Use descriptive camelCase names: "isHighMileage", "hasExistingPolicy", "needsFinancing"

**SECTION GROUPING LOGIC:**
- Group related fields into logical sections
- Keep sections focused (3-10 fields per section)
- Sections can have conditions to show/hide entire groups

**OUTPUT FORMAT:**
Return ONLY the JSON object. Do NOT include markdown code blocks, explanations, or any other text.`;

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

    const { naturalLanguageInput, provider = 'openai', model, apiKey, locale } = await request.json();

    // Validate inputs
    if (!naturalLanguageInput || typeof naturalLanguageInput !== 'string' || naturalLanguageInput.trim().length === 0) {
      return NextResponse.json(
        { error: 'Natural language input is required' },
        { status: 400 }
      );
    }

    // Validate provider
    const validProviders = ['gemini', 'cohere', 'openai', 'anthropic', 'bedrock'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate API key/credentials based on provider
    if (provider === 'bedrock') {
      // Bedrock uses JSON credentials
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return NextResponse.json(
          { error: 'AWS credentials are required for Bedrock.' },
          { status: 400 }
        );
      }
      try {
        const creds = JSON.parse(apiKey);
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
    } else {
      // Standard API key validation for other providers
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return NextResponse.json(
          { error: 'API key is required. Please provide your API key for the selected provider.' },
          { status: 400 }
        );
      }
    }

    // Resolve locale (fallback to default if not provided or invalid)
    const resolvedLocale = (locale && isLocaleSupported(locale)) ? locale : DEFAULT_LOCALE;

    console.log(`Generating form structure with ${provider} for locale ${resolvedLocale}...`);

    // Build locale-aware prompt
    const formPrompt = buildFormGenerationPrompt(resolvedLocale);

    // Generate form structure using the LLM provider abstraction
    const response = await generateSummary(
      provider,
      naturalLanguageInput,
      apiKey,
      formPrompt,
      model
    );

    // Parse the JSON response
    let formStructure;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;

      formStructure = JSON.parse(jsonString.trim());
    } catch (parseError) {
      console.error('Failed to parse LLM response as JSON:', parseError);
      console.error('Response was:', response);
      return NextResponse.json(
        { error: 'Failed to parse form structure. The AI did not return valid JSON. Please try again.' },
        { status: 500 }
      );
    }

    // Validate the structure
    if (!Array.isArray(formStructure.sections) || formStructure.sections.length === 0) {
      return NextResponse.json(
        { error: 'Generated form structure is missing sections array' },
        { status: 500 }
      );
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
