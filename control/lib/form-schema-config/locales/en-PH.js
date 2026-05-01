/**
 * English - Philippines (en-PH) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-PH',
  name: 'Philippines',
  region: 'Asia',
  currency: 'PHP',
  dateFormat: 'MM/DD/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+63|0)\\d{10}$',
    error: 'Enter a valid Philippine phone number',
    description: 'Philippine phone number'
  },
  mobile: {
    pattern: '^(\\+63|0)9\\d{9}$',
    error: 'Enter a valid Philippine mobile number',
    description: 'Philippine mobile number'
  },
  postalCode: {
    pattern: '^\\d{4}$',
    error: 'Enter a valid ZIP code (4 digits)',
    description: 'Philippine ZIP code'
  },
  tin: {
    pattern: '^\\d{3}-?\\d{3}-?\\d{3}-?\\d{3,5}$',
    error: 'Enter a valid TIN',
    description: 'Tax Identification Number'
  },
  sss: {
    pattern: '^\\d{2}-?\\d{7}-?\\d{1}$',
    error: 'Enter a valid SSS number',
    description: 'Social Security System number'
  },
  philhealth: {
    pattern: '^\\d{2}-?\\d{9}-?\\d{1}$',
    error: 'Enter a valid PhilHealth number',
    description: 'PhilHealth ID number'
  },
  pagibig: {
    pattern: '^\\d{4}-?\\d{4}-?\\d{4}$',
    error: 'Enter a valid Pag-IBIG number',
    description: 'Pag-IBIG MID number'
  },
  umid: {
    pattern: '^\\d{4}-?\\d{7}-?\\d{1}$',
    error: 'Enter a valid UMID number',
    description: 'Unified Multi-Purpose ID'
  },
  bankAccount: {
    pattern: '^\\d{10,16}$',
    error: 'Enter a valid bank account number',
    description: 'Philippine bank account'
  },
  gcash: {
    pattern: '^(\\+63|0)9\\d{9}$',
    error: 'Enter a valid GCash number',
    description: 'GCash mobile number'
  },
  currency: {
    pattern: '^(₱|PHP)?\\s?[\\d,]+(\\.\\d{2})?$',
    error: 'Enter a valid amount',
    description: 'Philippine Peso amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '0917 123 4567',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '1234',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 4
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '1234-5678901-2',
    pattern: PATTERNS.umid.pattern,
    patternError: PATTERNS.umid.error,
    pii: true,
    sensitive: true,
    helpText: 'Your ID number will be stored securely'
  },
  tin: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '123-456-789-000',
    pattern: PATTERNS.tin.pattern,
    patternError: PATTERNS.tin.error,
    pii: true
  },
  sss: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '12-3456789-0',
    pattern: PATTERNS.sss.pattern,
    patternError: PATTERNS.sss.error,
    pii: true
  },
  gcash: {
    type: 'tel',
    inputMode: 'tel',
    placeholder: '0917 123 4567',
    pattern: PATTERNS.gcash.pattern,
    patternError: PATTERNS.gcash.error,
    pii: true
  },
  region: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'NCR', label: 'NCR - National Capital Region' },
      { value: 'CAR', label: 'CAR - Cordillera Administrative Region' },
      { value: 'I', label: 'Region I - Ilocos Region' },
      { value: 'II', label: 'Region II - Cagayan Valley' },
      { value: 'III', label: 'Region III - Central Luzon' },
      { value: 'IV-A', label: 'Region IV-A - CALABARZON' },
      { value: 'IV-B', label: 'Region IV-B - MIMAROPA' },
      { value: 'V', label: 'Region V - Bicol Region' },
      { value: 'VI', label: 'Region VI - Western Visayas' },
      { value: 'VII', label: 'Region VII - Central Visayas' },
      { value: 'VIII', label: 'Region VIII - Eastern Visayas' },
      { value: 'IX', label: 'Region IX - Zamboanga Peninsula' },
      { value: 'X', label: 'Region X - Northern Mindanao' },
      { value: 'XI', label: 'Region XI - Davao Region' },
      { value: 'XII', label: 'Region XII - SOCCSKSARGEN' },
      { value: 'XIII', label: 'Region XIII - Caraga' },
      { value: 'BARMM', label: 'BARMM - Bangsamoro' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '₱1,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Philippine English field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'ZIP Code',
  state: 'Region',
  province: 'Province',
  nationalId: 'UMID/National ID',
  phone: 'Phone Number',
  mobile: 'Mobile Number',
  firstName: 'First Name',
  middleName: 'Middle Name',
  lastName: 'Last Name',
  fullName: 'Full Name',
  streetAddress: 'Street Address',
  city: 'City/Municipality',
  barangay: 'Barangay',
  email: 'Email Address',
  dateOfBirth: 'Date of Birth',
  company: 'Company Name'
};

/**
 * DPA (Data Privacy Act of 2012) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'I consent to the collection, processing, and storage of my personal data in accordance with the Privacy Policy and the Data Privacy Act of 2012.'
};
