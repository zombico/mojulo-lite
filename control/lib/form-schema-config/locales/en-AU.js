/**
 * Australian English (en-AU) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-AU',
  name: 'Australia',
  region: 'Oceania',
  currency: 'AUD',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+61|0)[2-478]\\d{8}$',
    error: 'Enter a valid Australian phone number',
    description: 'Australian phone number'
  },
  mobile: {
    pattern: '^(\\+61|0)4\\d{8}$',
    error: 'Enter a valid Australian mobile number',
    description: 'Australian mobile number'
  },
  postalCode: {
    pattern: '^\\d{4}$',
    error: 'Enter a valid postcode (4 digits)',
    description: 'Australian postcode'
  },
  tfn: {
    pattern: '^\\d{3}\\s?\\d{3}\\s?\\d{3}$',
    error: 'Enter a valid TFN (9 digits)',
    description: 'Tax File Number'
  },
  abn: {
    pattern: '^\\d{2}\\s?\\d{3}\\s?\\d{3}\\s?\\d{3}$',
    error: 'Enter a valid ABN (11 digits)',
    description: 'Australian Business Number'
  },
  acn: {
    pattern: '^\\d{3}\\s?\\d{3}\\s?\\d{3}$',
    error: 'Enter a valid ACN (9 digits)',
    description: 'Australian Company Number'
  },
  medicareNumber: {
    pattern: '^\\d{4}\\s?\\d{5}\\s?\\d{1}(\\s?\\d{1})?$',
    error: 'Enter a valid Medicare number',
    description: 'Medicare card number'
  },
  bsb: {
    pattern: '^\\d{3}-?\\d{3}$',
    error: 'Enter a valid BSB (6 digits)',
    description: 'Bank State Branch number'
  },
  bankAccount: {
    pattern: '^\\d{6,10}$',
    error: 'Enter a valid account number',
    description: 'Australian bank account number'
  },
  currency: {
    pattern: '^\\$?[\\d,]+(\\.\\d{2})?$',
    error: 'Enter a valid amount',
    description: 'Australian Dollar amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '0412 345 678',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '2000',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 4
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '123 456 789',
    pattern: PATTERNS.tfn.pattern,
    patternError: PATTERNS.tfn.error,
    pii: true,
    sensitive: true,
    helpText: 'Your TFN is stored securely'
  },
  abn: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '51 824 753 556',
    pattern: PATTERNS.abn.pattern,
    patternError: PATTERNS.abn.error,
    pii: true
  },
  bsb: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '062-000',
    pattern: PATTERNS.bsb.pattern,
    patternError: PATTERNS.bsb.error,
    pii: true
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'NSW', label: 'New South Wales' },
      { value: 'VIC', label: 'Victoria' },
      { value: 'QLD', label: 'Queensland' },
      { value: 'WA', label: 'Western Australia' },
      { value: 'SA', label: 'South Australia' },
      { value: 'TAS', label: 'Tasmania' },
      { value: 'ACT', label: 'Australian Capital Territory' },
      { value: 'NT', label: 'Northern Territory' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '$100.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Australian English field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Postcode',
  state: 'State/Territory',
  nationalId: 'Tax File Number (TFN)',
  phone: 'Phone number',
  mobile: 'Mobile number',
  firstName: 'Given name',
  lastName: 'Surname',
  fullName: 'Full name',
  streetAddress: 'Street address',
  city: 'Suburb',
  email: 'Email address',
  dateOfBirth: 'Date of birth',
  company: 'Company name'
};

/**
 * Australian Privacy Act compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'I consent to the collection and use of my personal information in accordance with the Privacy Policy.'
};
