/**
 * English - Nigeria (en-NG) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-NG',
  name: 'Nigeria',
  region: 'Africa',
  currency: 'NGN',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+234|0)[789]\\d{9}$',
    error: 'Enter a valid Nigerian phone number',
    description: 'Nigerian phone number'
  },
  mobile: {
    pattern: '^(\\+234|0)[789]0\\d{8}$',
    error: 'Enter a valid Nigerian mobile number',
    description: 'Nigerian mobile number'
  },
  postalCode: {
    pattern: '^\\d{6}$',
    error: 'Enter a valid postal code (6 digits)',
    description: 'Nigerian postal code'
  },
  nin: {
    pattern: '^\\d{11}$',
    error: 'Enter a valid NIN (11 digits)',
    description: 'National Identification Number'
  },
  bvn: {
    pattern: '^\\d{11}$',
    error: 'Enter a valid BVN (11 digits)',
    description: 'Bank Verification Number'
  },
  tin: {
    pattern: '^\\d{8}-?\\d{4}$',
    error: 'Enter a valid TIN',
    description: 'Tax Identification Number'
  },
  cac: {
    pattern: '^RC\\d{4,7}$',
    error: 'Enter a valid CAC number (e.g., RC123456)',
    description: 'Corporate Affairs Commission number'
  },
  bankAccount: {
    pattern: '^\\d{10}$',
    error: 'Enter a valid NUBAN account number (10 digits)',
    description: 'NUBAN bank account'
  },
  currency: {
    pattern: '^(₦|NGN)?\\s?[\\d,]+(\\.\\d{2})?$',
    error: 'Enter a valid amount',
    description: 'Nigerian Naira amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '0801 234 5678',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '100001',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 6
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '12345678901',
    pattern: PATTERNS.nin.pattern,
    patternError: PATTERNS.nin.error,
    pii: true,
    sensitive: true,
    helpText: 'Your NIN will be stored securely'
  },
  bvn: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '12345678901',
    pattern: PATTERNS.bvn.pattern,
    patternError: PATTERNS.bvn.error,
    pii: true,
    sensitive: true,
    helpText: 'Your BVN will be stored securely'
  },
  tin: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '12345678-0001',
    pattern: PATTERNS.tin.pattern,
    patternError: PATTERNS.tin.error,
    pii: true
  },
  bankAccount: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '0123456789',
    pattern: PATTERNS.bankAccount.pattern,
    patternError: PATTERNS.bankAccount.error,
    pii: true,
    maxLength: 10
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AB', label: 'Abia' },
      { value: 'AD', label: 'Adamawa' },
      { value: 'AK', label: 'Akwa Ibom' },
      { value: 'AN', label: 'Anambra' },
      { value: 'BA', label: 'Bauchi' },
      { value: 'BY', label: 'Bayelsa' },
      { value: 'BE', label: 'Benue' },
      { value: 'BO', label: 'Borno' },
      { value: 'CR', label: 'Cross River' },
      { value: 'DE', label: 'Delta' },
      { value: 'EB', label: 'Ebonyi' },
      { value: 'ED', label: 'Edo' },
      { value: 'EK', label: 'Ekiti' },
      { value: 'EN', label: 'Enugu' },
      { value: 'FC', label: 'FCT - Abuja' },
      { value: 'GO', label: 'Gombe' },
      { value: 'IM', label: 'Imo' },
      { value: 'JI', label: 'Jigawa' },
      { value: 'KD', label: 'Kaduna' },
      { value: 'KN', label: 'Kano' },
      { value: 'KT', label: 'Katsina' },
      { value: 'KE', label: 'Kebbi' },
      { value: 'KO', label: 'Kogi' },
      { value: 'KW', label: 'Kwara' },
      { value: 'LA', label: 'Lagos' },
      { value: 'NA', label: 'Nasarawa' },
      { value: 'NI', label: 'Niger' },
      { value: 'OG', label: 'Ogun' },
      { value: 'ON', label: 'Ondo' },
      { value: 'OS', label: 'Osun' },
      { value: 'OY', label: 'Oyo' },
      { value: 'PL', label: 'Plateau' },
      { value: 'RI', label: 'Rivers' },
      { value: 'SO', label: 'Sokoto' },
      { value: 'TA', label: 'Taraba' },
      { value: 'YO', label: 'Yobe' },
      { value: 'ZA', label: 'Zamfara' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '₦100,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Nigerian English field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Postal Code',
  state: 'State',
  lga: 'Local Government Area',
  nationalId: 'NIN',
  phone: 'Phone Number',
  mobile: 'Mobile Number',
  firstName: 'First Name',
  middleName: 'Middle Name',
  lastName: 'Surname',
  fullName: 'Full Name',
  streetAddress: 'Address',
  city: 'City/Town',
  email: 'Email Address',
  dateOfBirth: 'Date of Birth',
  company: 'Company Name'
};

/**
 * NDPR (Nigeria Data Protection Regulation) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'I consent to the collection, processing, and storage of my personal data in accordance with the Privacy Policy and the Nigeria Data Protection Regulation (NDPR).'
};
