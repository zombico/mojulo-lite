/**
 * English - Singapore (en-SG) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-SG',
  name: 'Singapore',
  region: 'Asia',
  currency: 'SGD',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+65[\\s-]?)?[689]\\d{7}$',
    error: 'Enter a valid Singapore phone number',
    description: 'Singapore phone number'
  },
  mobile: {
    pattern: '^(\\+65[\\s-]?)?[89]\\d{7}$',
    error: 'Enter a valid Singapore mobile number',
    description: 'Singapore mobile number'
  },
  postalCode: {
    pattern: '^\\d{6}$',
    error: 'Enter a valid postal code (6 digits)',
    description: 'Singapore postal code'
  },
  nric: {
    pattern: '^[STFGM]\\d{7}[A-Z]$',
    error: 'Enter a valid NRIC/FIN',
    description: 'National Registration Identity Card / Foreign Identification Number'
  },
  uen: {
    pattern: '^(\\d{8}[A-Z]|\\d{9}[A-Z]|[TS]\\d{2}[A-Z]{2}\\d{4}[A-Z])$',
    error: 'Enter a valid UEN',
    description: 'Unique Entity Number'
  },
  bankAccount: {
    pattern: '^\\d{9,12}$',
    error: 'Enter a valid bank account number',
    description: 'Singapore bank account'
  },
  paynow: {
    pattern: '^([89]\\d{7}|[STFGM]\\d{7}[A-Z]|\\d{9,12})$',
    error: 'Enter a valid PayNow ID',
    description: 'PayNow mobile/NRIC/UEN'
  },
  currency: {
    pattern: '^(S\\$|\\$)?[\\d,]+(\\.\\d{2})?$',
    error: 'Enter a valid amount',
    description: 'Singapore Dollar amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '9123 4567',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '123456',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 6
  },
  nationalId: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'S1234567A',
    pattern: PATTERNS.nric.pattern,
    patternError: PATTERNS.nric.error,
    pii: true,
    sensitive: true,
    helpText: 'Your NRIC/FIN will be stored securely',
    maxLength: 9
  },
  uen: {
    type: 'text',
    inputMode: 'text',
    placeholder: '201812345A',
    pattern: PATTERNS.uen.pattern,
    patternError: PATTERNS.uen.error,
    pii: true
  },
  paynow: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'Mobile/NRIC/UEN',
    pattern: PATTERNS.paynow.pattern,
    patternError: PATTERNS.paynow.error,
    pii: true
  },
  region: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'central', label: 'Central Region' },
      { value: 'east', label: 'East Region' },
      { value: 'north', label: 'North Region' },
      { value: 'north-east', label: 'North-East Region' },
      { value: 'west', label: 'West Region' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'S$1,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Singapore English field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Postal Code',
  state: 'Region',
  nationalId: 'NRIC/FIN',
  phone: 'Phone Number',
  mobile: 'Mobile Number',
  firstName: 'Given Name',
  lastName: 'Family Name',
  fullName: 'Full Name (as in NRIC)',
  streetAddress: 'Street Address',
  city: 'City',
  block: 'Block/House No.',
  floor: 'Floor',
  unit: 'Unit',
  building: 'Building Name',
  email: 'Email Address',
  dateOfBirth: 'Date of Birth',
  company: 'Company Name'
};

/**
 * PDPA (Personal Data Protection Act) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'I consent to the collection, use, and disclosure of my personal data in accordance with the Privacy Policy.'
};
