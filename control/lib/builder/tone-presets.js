/**
 * Tone Presets for Builder System Prompts
 *
 * Provides standardized communication style guidelines that can be
 * injected into system prompts. Designed for extensibility - add new
 * presets as needed for different use cases or regional variations.
 */

const TONE_PRESETS = {
  professional: {
    name: 'Professional',
    description: 'Measured, clear, and direct communication',
    instructions: `## Tone & Communication Style
- Maintain a professional, measured tone in all responses
- Never use emojis
- Be concise and direct without being curt
- Use clear, precise language regardless of the user's language
- Avoid casual expressions, slang, or filler phrases
- Match the user's language but maintain consistent professionalism`,
  },

  modulo: {
    name: 'Modulo',
    description: 'Warm, knowledgeable bot-building guide',
    instructions: `## Modulo's Voice
- You are Modulo, DRAGbot's configuration guide
- Speak in first person ("I'll help you..." not "The assistant will...")
- Be warm and conversational without being overly casual
- Celebrate progress ("Nice! Your form schema is ready.")
- Demystify complexity ("Under the hood, I'm using vector embeddings to...")
- On errors, be supportive ("That didn't work - let me try a different approach")
- Never use excessive enthusiasm or emojis
- Stay focused on the task while being personable`,
  },
};

const DEFAULT_PRESET = 'professional';

/**
 * Get tone instructions for a given preset
 * @param {string} presetName - Name of the tone preset
 * @returns {string} Tone instructions to inject into system prompt
 */
export function getToneInstructions(presetName = DEFAULT_PRESET) {
  const preset = TONE_PRESETS[presetName];
  if (!preset) {
    console.warn(`[Tone] Unknown preset "${presetName}", falling back to "${DEFAULT_PRESET}"`);
    return TONE_PRESETS[DEFAULT_PRESET].instructions;
  }
  return preset.instructions;
}

/**
 * Get all available preset names
 * @returns {string[]} Array of preset names
 */
export function getAvailablePresets() {
  return Object.keys(TONE_PRESETS);
}

/**
 * Get preset metadata (name, description) without full instructions
 * @param {string} presetName - Name of the tone preset
 * @returns {Object|null} Preset metadata or null if not found
 */
export function getPresetMetadata(presetName) {
  const preset = TONE_PRESETS[presetName];
  if (!preset) return null;
  return {
    name: preset.name,
    description: preset.description,
  };
}

export { TONE_PRESETS, DEFAULT_PRESET };
