/**
 * British English (en-GB) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-GB',
  name: 'United Kingdom',
  region: 'EU',
  currency: 'GBP',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+44|0)\\d{10,11}$',
    error: 'Enter a valid UK phone number',
    description: 'UK phone number'
  },
  postalCode: {
    pattern: '^[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}$',
    error: 'Enter a valid UK postcode (e.g., SW1A 1AA)',
    description: 'UK postcode'
  },
  nationalInsurance: {
    pattern: '^[A-CEGHJ-PR-TW-Z]{2}\\d{6}[A-D]$',
    error: 'Enter a valid NI number (e.g., AB123456C)',
    description: 'National Insurance number'
  },
  sortCode: {
    pattern: '^\\d{2}[- ]?\\d{2}[- ]?\\d{2}$',
    error: 'Enter a valid sort code (XX-XX-XX)',
    description: 'Bank sort code'
  },
  accountNumber: {
    pattern: '^\\d{8}$',
    error: 'Enter an 8-digit account number',
    description: 'UK bank account number'
  },
  vatNumber: {
    pattern: '^GB\\d{9}$|^GB\\d{12}$|^GBGD\\d{3}$|^GBHA\\d{3}$',
    error: 'Enter a valid UK VAT number',
    description: 'UK VAT number'
  },
  driversLicense: {
    pattern: '^[A-Z]{2}\\d{6}[A-Z]{2}\\d[A-Z]{2}$',
    error: 'Enter a valid UK driving licence number',
    description: 'UK driving licence'
  },
  nhsNumber: {
    pattern: '^\\d{3}\\s?\\d{3}\\s?\\d{4}$',
    error: 'Enter a valid NHS number',
    description: 'NHS number'
  },
  currency: {
    pattern: '^£?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$',
    error: 'Enter a valid amount in pounds',
    description: 'British pounds'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '07700 900000',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'text',
    placeholder: 'SW1A 1AA',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 8
  },
  nationalInsurance: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'AB 12 34 56 C',
    pattern: PATTERNS.nationalInsurance.pattern,
    patternError: PATTERNS.nationalInsurance.error,
    pii: true,
    sensitive: true,
    helpText: 'Your National Insurance number will be kept secure'
  },
  county: {
    type: 'text',
    autocomplete: 'address-level1',
    placeholder: 'County (optional)'
  },
  sortCode: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '00-00-00',
    pattern: PATTERNS.sortCode.pattern,
    patternError: PATTERNS.sortCode.error,
    pii: true
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '£0.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * UK-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Postcode',
  state: 'County',
  nationalId: 'National Insurance Number',
  phone: 'Phone Number',
  addressLine1: 'Address Line 1',
  addressLine2: 'Address Line 2',
  city: 'Town/City'
};

/**
 * GDPR compliance hints for UK/EU
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true
};
