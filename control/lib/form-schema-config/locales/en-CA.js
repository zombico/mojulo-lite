/**
 * Canadian English (en-CA) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-CA',
  name: 'Canada',
  region: 'NA',
  currency: 'CAD',
  dateFormat: 'YYYY-MM-DD'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+1)?[-.\\s]?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}$',
    error: 'Enter a valid Canadian phone number',
    description: 'Canadian phone number'
  },
  postalCode: {
    pattern: '^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$',
    error: 'Enter a valid postal code (e.g., A1A 1A1)',
    description: 'Canadian postal code'
  },
  sin: {
    pattern: '^\\d{3}[- ]?\\d{3}[- ]?\\d{3}$',
    error: 'Enter a valid SIN (XXX-XXX-XXX)',
    description: 'Social Insurance Number'
  },
  provinceCode: {
    pattern: '^[A-Z]{2}$',
    error: 'Enter a 2-letter province code',
    description: 'Canadian province code'
  },
  currency: {
    pattern: '^\\$?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$',
    error: 'Enter a valid dollar amount',
    description: 'Canadian currency'
  },
  driversLicense: {
    pattern: '^[A-Z0-9]{5,15}$',
    error: 'Enter a valid driver\'s license number',
    description: 'Canadian driver\'s license (varies by province)'
  },
  healthCard: {
    pattern: '^[A-Z0-9]{10,12}$',
    error: 'Enter a valid health card number',
    description: 'Provincial health card number'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '(555) 555-5555',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'text',
    placeholder: 'A1A 1A1',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 7
  },
  sin: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: 'XXX-XXX-XXX',
    pattern: PATTERNS.sin.pattern,
    patternError: PATTERNS.sin.error,
    pii: true,
    sensitive: true,
    helpText: 'Your Social Insurance Number will be kept secure'
  },
  province: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AB', label: 'Alberta' },
      { value: 'BC', label: 'British Columbia' },
      { value: 'MB', label: 'Manitoba' },
      { value: 'NB', label: 'New Brunswick' },
      { value: 'NL', label: 'Newfoundland and Labrador' },
      { value: 'NS', label: 'Nova Scotia' },
      { value: 'NT', label: 'Northwest Territories' },
      { value: 'NU', label: 'Nunavut' },
      { value: 'ON', label: 'Ontario' },
      { value: 'PE', label: 'Prince Edward Island' },
      { value: 'QC', label: 'Quebec' },
      { value: 'SK', label: 'Saskatchewan' },
      { value: 'YT', label: 'Yukon' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '$0.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Canada-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Postal Code',
  state: 'Province',
  nationalId: 'Social Insurance Number (SIN)'
};
