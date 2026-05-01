/**
 * English - Malaysia (en-MY) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-MY',
  name: 'Malaysia',
  region: 'Asia',
  currency: 'MYR',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+60|0)[1-9]\\d{7,9}$',
    error: 'Enter a valid Malaysian phone number',
    description: 'Malaysian phone number'
  },
  mobile: {
    pattern: '^(\\+60|0)1[0-9]\\d{7,8}$',
    error: 'Enter a valid Malaysian mobile number',
    description: 'Malaysian mobile number'
  },
  postalCode: {
    pattern: '^\\d{5}$',
    error: 'Enter a valid postcode (5 digits)',
    description: 'Malaysian postcode'
  },
  nric: {
    pattern: '^\\d{6}-?\\d{2}-?\\d{4}$',
    error: 'Enter a valid NRIC (e.g., 880101-14-1234)',
    description: 'National Registration Identity Card'
  },
  passport: {
    pattern: '^[A-Z]\\d{8}$',
    error: 'Enter a valid passport number',
    description: 'Malaysian passport number'
  },
  brn: {
    pattern: '^\\d{12}[A-Z]?$',
    error: 'Enter a valid business registration number',
    description: 'Business Registration Number'
  },
  tin: {
    pattern: '^[A-Z]\\d{10}$',
    error: 'Enter a valid TIN',
    description: 'Tax Identification Number'
  },
  bankAccount: {
    pattern: '^\\d{10,16}$',
    error: 'Enter a valid bank account number',
    description: 'Malaysian bank account'
  },
  duitnow: {
    pattern: '^(\\+60|0)1[0-9]\\d{7,8}$|^\\d{6}-?\\d{2}-?\\d{4}$',
    error: 'Enter a valid DuitNow ID',
    description: 'DuitNow mobile/NRIC'
  },
  currency: {
    pattern: '^(RM|MYR)?\\s?[\\d,]+(\\.\\d{2})?$',
    error: 'Enter a valid amount',
    description: 'Malaysian Ringgit amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '012-345 6789',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '50000',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 5
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '880101-14-1234',
    pattern: PATTERNS.nric.pattern,
    patternError: PATTERNS.nric.error,
    pii: true,
    sensitive: true,
    helpText: 'Your NRIC will be stored securely'
  },
  tin: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'C1234567890',
    pattern: PATTERNS.tin.pattern,
    patternError: PATTERNS.tin.error,
    pii: true
  },
  duitnow: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'Mobile/NRIC',
    pattern: PATTERNS.duitnow.pattern,
    patternError: PATTERNS.duitnow.error,
    pii: true
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'JHR', label: 'Johor' },
      { value: 'KDH', label: 'Kedah' },
      { value: 'KTN', label: 'Kelantan' },
      { value: 'KUL', label: 'Kuala Lumpur' },
      { value: 'LBN', label: 'Labuan' },
      { value: 'MLK', label: 'Melaka' },
      { value: 'NSN', label: 'Negeri Sembilan' },
      { value: 'PHG', label: 'Pahang' },
      { value: 'PNG', label: 'Penang' },
      { value: 'PRK', label: 'Perak' },
      { value: 'PLS', label: 'Perlis' },
      { value: 'PJY', label: 'Putrajaya' },
      { value: 'SBH', label: 'Sabah' },
      { value: 'SWK', label: 'Sarawak' },
      { value: 'SGR', label: 'Selangor' },
      { value: 'TRG', label: 'Terengganu' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'RM 1,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Malaysian English field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Postcode',
  state: 'State',
  nationalId: 'NRIC',
  phone: 'Phone Number',
  mobile: 'Mobile Number',
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name (as in NRIC)',
  streetAddress: 'Address',
  city: 'City',
  email: 'Email Address',
  dateOfBirth: 'Date of Birth',
  company: 'Company Name',
  race: 'Race',
  religion: 'Religion'
};

/**
 * PDPA (Personal Data Protection Act 2010) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'I consent to the processing of my personal data in accordance with the Privacy Policy and the Personal Data Protection Act 2010.'
};
