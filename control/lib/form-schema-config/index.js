/**
 * Form Schema Configuration Index
 *
 * Resolves locale-specific configurations and builds LLM prompt injections.
 */

import * as base from './base.js';
import * as enUS from './locales/en-US.js';
import * as enCA from './locales/en-CA.js';
import * as frCA from './locales/fr-CA.js';
import * as enGB from './locales/en-GB.js';
import * as deDE from './locales/de-DE.js';
import * as frFR from './locales/fr-FR.js';
import * as itIT from './locales/it-IT.js';
import * as nlNL from './locales/nl-NL.js';
import * as esES from './locales/es-ES.js';
import * as jaJP from './locales/ja-JP.js';
import * as koKR from './locales/ko-KR.js';
import * as ptBR from './locales/pt-BR.js';
import * as enAU from './locales/en-AU.js';
import * as esMX from './locales/es-MX.js';
import * as arAE from './locales/ar-AE.js';
import * as zhCN from './locales/zh-CN.js';
import * as enIN from './locales/en-IN.js';
import * as zhHK from './locales/zh-HK.js';
import * as enSG from './locales/en-SG.js';
import * as enPH from './locales/en-PH.js';
import * as enMY from './locales/en-MY.js';
import * as enNG from './locales/en-NG.js';

/**
 * Available locales with their configurations
 */
const LOCALES = {
  'en-US': enUS,
  'en-CA': enCA,
  'fr-CA': frCA,
  'en-GB': enGB,
  'de-DE': deDE,
  'fr-FR': frFR,
  'it-IT': itIT,
  'nl-NL': nlNL,
  'es-ES': esES,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'pt-BR': ptBR,
  'en-AU': enAU,
  'es-MX': esMX,
  'ar-AE': arAE,
  'zh-CN': zhCN,
  'en-IN': enIN,
  'zh-HK': zhHK,
  'en-SG': enSG,
  'en-PH': enPH,
  'en-MY': enMY,
  'en-NG': enNG
};

/**
 * Locale metadata for UI display
 */
export const SUPPORTED_LOCALES = [
  { code: 'en-US', name: 'United States', flag: '🇺🇸', region: 'North America' },
  { code: 'en-CA', name: 'Canada (English)', flag: '🇨🇦', region: 'North America' },
  { code: 'fr-CA', name: 'Canada (Français)', flag: '🇨🇦', region: 'North America' },
  { code: 'en-GB', name: 'United Kingdom', flag: '🇬🇧', region: 'Europe' },
  { code: 'de-DE', name: 'Germany', flag: '🇩🇪', region: 'Europe' },
  { code: 'fr-FR', name: 'France', flag: '🇫🇷', region: 'Europe' },
  { code: 'it-IT', name: 'Italy', flag: '🇮🇹', region: 'Europe' },
  { code: 'nl-NL', name: 'Netherlands', flag: '🇳🇱', region: 'Europe' },
  { code: 'es-ES', name: 'Spain', flag: '🇪🇸', region: 'Europe' },
  { code: 'ja-JP', name: 'Japan', flag: '🇯🇵', region: 'Asia' },
  { code: 'ko-KR', name: 'South Korea', flag: '🇰🇷', region: 'Asia' },
  { code: 'pt-BR', name: 'Brazil', flag: '🇧🇷', region: 'South America' },
  { code: 'en-AU', name: 'Australia', flag: '🇦🇺', region: 'Oceania' },
  { code: 'es-MX', name: 'Mexico', flag: '🇲🇽', region: 'North America' },
  { code: 'ar-AE', name: 'United Arab Emirates', flag: '🇦🇪', region: 'Middle East' },
  { code: 'zh-CN', name: 'China', flag: '🇨🇳', region: 'Asia' },
  { code: 'en-IN', name: 'India', flag: '🇮🇳', region: 'Asia' },
  { code: 'zh-HK', name: 'Hong Kong', flag: '🇭🇰', region: 'Asia' },
  { code: 'en-SG', name: 'Singapore', flag: '🇸🇬', region: 'Asia' },
  { code: 'en-PH', name: 'Philippines', flag: '🇵🇭', region: 'Asia' },
  { code: 'en-MY', name: 'Malaysia', flag: '🇲🇾', region: 'Asia' },
  { code: 'en-NG', name: 'Nigeria', flag: '🇳🇬', region: 'Africa' }
];

/**
 * Default locale fallback
 */
export const DEFAULT_LOCALE = 'en-US';

/**
 * Get merged configuration for a specific locale
 *
 * @param {string} localeCode - Locale code (e.g., 'en-US', 'de-DE')
 * @returns {Object} Merged configuration with base + locale-specific patterns
 */
export function getFormSchemaConfig(localeCode = DEFAULT_LOCALE) {
  const locale = LOCALES[localeCode] || LOCALES[DEFAULT_LOCALE];

  return {
    localeInfo: locale.LOCALE_INFO,
    patterns: {
      ...base.BASE_PATTERNS,
      ...locale.PATTERNS
    },
    autocomplete: base.BASE_AUTOCOMPLETE,
    inputModes: base.INPUT_MODES,
    archetypes: {
      ...base.BASE_ARCHETYPES,
      ...locale.ARCHETYPES
    },
    fieldLabels: locale.FIELD_LABELS || {},
    piiIndicators: base.PII_INDICATORS,
    gdprHints: locale.GDPR_HINTS || null
  };
}

/**
 * Build validation patterns section for LLM prompt
 */
function buildPatternsPrompt(patterns, localeInfo) {
  const lines = [`**VALIDATION PATTERNS (${localeInfo.code}):**`];

  for (const [name, config] of Object.entries(patterns)) {
    lines.push(`- ${name}: "${config.pattern}" - ${config.description}`);
  }

  return lines.join('\n');
}

/**
 * Build archetypes section for LLM prompt
 */
function buildArchetypesPrompt(archetypes) {
  const lines = [
    '**FIELD ARCHETYPES (use these templates for common fields):**',
    'When generating these field types, include all specified attributes:'
  ];

  const priority = ['email', 'phone', 'postalCode', 'nationalId', 'iban', 'currency'];

  for (const name of priority) {
    if (archetypes[name]) {
      const attrs = Object.entries(archetypes[name])
        .filter(([k, v]) => v !== undefined && k !== 'options')
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ');
      lines.push(`- ${name}: { ${attrs} }`);
    }
  }

  return lines.join('\n');
}

/**
 * Build autocomplete reference for LLM prompt
 */
function buildAutocompletePrompt() {
  return `**AUTOCOMPLETE ATTRIBUTES (for browser autofill):**
Use the "autocomplete" attribute for these field types:
- Names: name, given-name, family-name, additional-name
- Contact: email, tel
- Address: street-address, address-line1, address-line2, address-level2 (city), address-level1 (state/province), postal-code, country-name
- Personal: bday, organization, organization-title`;
}

/**
 * Build input mode reference for LLM prompt
 */
function buildInputModePrompt() {
  return `**INPUT MODES (mobile keyboard optimization):**
Use the "inputMode" attribute:
- "numeric": ZIP codes, PINs, quantities (number pad)
- "tel": Phone numbers (phone keypad)
- "email": Email addresses (@ and . accessible)
- "decimal": Prices, measurements (numbers with decimal)
- "url": Website URLs (/ and . accessible)`;
}

/**
 * Build PII guidance for LLM prompt
 */
function buildPiiPrompt() {
  return `**PII (Personally Identifiable Information):**
Mark fields as "pii": true when they contain:
- Names, addresses, contact info (email, phone)
- Government IDs (SSN, SIN, NI number, tax IDs)
- Financial info (bank accounts, IBAN, card numbers)
- Date of birth

PII fields receive special handling and are never sent to AI models.
For highly sensitive fields (SSN, passwords), also add "sensitive": true.`;
}

/**
 * Build GDPR section if applicable
 */
function buildGdprPrompt(gdprHints) {
  if (!gdprHints) return null;

  return `**GDPR COMPLIANCE (EU):**
For forms collecting personal data in the EU:
- Include a consent checkbox field with clear data processing language
- Mark all personal data fields with "pii": true
- Consider adding "helpText" explaining data usage on sensitive fields`;
}

/**
 * Build locale-specific field label hints
 */
function buildFieldLabelsPrompt(fieldLabels, localeInfo) {
  if (!fieldLabels || Object.keys(fieldLabels).length === 0) return null;

  const lines = [`**LOCALIZED FIELD LABELS (${localeInfo.name}):**`];
  lines.push('Use these labels for common fields:');

  for (const [key, label] of Object.entries(fieldLabels)) {
    lines.push(`- ${key}: "${label}"`);
  }

  return lines.join('\n');
}

/**
 * Build the complete prompt injection for a locale
 *
 * @param {string} localeCode - Locale code
 * @returns {string} Complete prompt section to inject
 */
export function buildFormSchemaPrompt(localeCode = DEFAULT_LOCALE) {
  const config = getFormSchemaConfig(localeCode);
  const { localeInfo, patterns, archetypes, fieldLabels, gdprHints } = config;

  const sections = [
    `**LOCALE: ${localeInfo.name} (${localeInfo.code})**`,
    `Date format: ${localeInfo.dateFormat} | Currency: ${localeInfo.currency}`,
    '',
    buildPatternsPrompt(patterns, localeInfo),
    '',
    buildArchetypesPrompt(archetypes),
    '',
    buildAutocompletePrompt(),
    '',
    buildInputModePrompt(),
    '',
    buildPiiPrompt()
  ];

  // Add GDPR section for EU locales
  const gdprSection = buildGdprPrompt(gdprHints);
  if (gdprSection) {
    sections.push('', gdprSection);
  }

  // Add localized field labels
  const labelsSection = buildFieldLabelsPrompt(fieldLabels, localeInfo);
  if (labelsSection) {
    sections.push('', labelsSection);
  }

  return sections.filter(s => s !== null).join('\n');
}

/**
 * Get locale info for UI display
 *
 * @param {string} localeCode - Locale code
 * @returns {Object|null} Locale info or null if not found
 */
export function getLocaleInfo(localeCode) {
  return SUPPORTED_LOCALES.find(l => l.code === localeCode) || null;
}

/**
 * Check if a locale is supported
 *
 * @param {string} localeCode - Locale code
 * @returns {boolean}
 */
export function isLocaleSupported(localeCode) {
  return localeCode in LOCALES;
}

// Re-export base utilities
export { FIELD_TYPES, INPUT_MODES, PII_INDICATORS } from './base.js';
