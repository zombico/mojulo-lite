/**
 * English - India (en-IN) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-IN',
  name: 'India',
  region: 'Asia',
  currency: 'INR',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+91[\\s-]?)?[6-9]\\d{9}$',
    error: 'Enter a valid Indian mobile number',
    description: 'Indian mobile number'
  },
  landline: {
    pattern: '^(\\+91[\\s-]?)?(0\\d{2,4})[\\s-]?\\d{6,8}$',
    error: 'Enter a valid landline number',
    description: 'Indian landline number'
  },
  postalCode: {
    pattern: '^[1-9]\\d{5}$',
    error: 'Enter a valid PIN code (6 digits)',
    description: 'Indian PIN code'
  },
  aadhaar: {
    pattern: '^\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}$',
    error: 'Enter a valid Aadhaar number (12 digits)',
    description: 'Aadhaar unique ID'
  },
  pan: {
    pattern: '^[A-Z]{5}\\d{4}[A-Z]$',
    error: 'Enter a valid PAN (e.g., ABCDE1234F)',
    description: 'Permanent Account Number'
  },
  gstin: {
    pattern: '^\\d{2}[A-Z]{5}\\d{4}[A-Z][A-Z\\d][Z][A-Z\\d]$',
    error: 'Enter a valid GSTIN',
    description: 'GST Identification Number'
  },
  voterId: {
    pattern: '^[A-Z]{3}\\d{7}$',
    error: 'Enter a valid Voter ID',
    description: 'Electoral Photo Identity Card'
  },
  passport: {
    pattern: '^[A-Z]\\d{7}$',
    error: 'Enter a valid passport number',
    description: 'Indian passport number'
  },
  ifsc: {
    pattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
    error: 'Enter a valid IFSC code',
    description: 'Indian Financial System Code'
  },
  bankAccount: {
    pattern: '^\\d{9,18}$',
    error: 'Enter a valid account number',
    description: 'Indian bank account number'
  },
  upi: {
    pattern: '^[\\w\\.\\-]+@[\\w]+$',
    error: 'Enter a valid UPI ID',
    description: 'UPI Virtual Payment Address'
  },
  currency: {
    pattern: '^(Rs\\.?|₹)?\\s?[\\d,]+(\\.\\d{2})?$',
    error: 'Enter a valid amount',
    description: 'Indian Rupee amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '98765 43210',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '110001',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 6
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '1234 5678 9012',
    pattern: PATTERNS.aadhaar.pattern,
    patternError: PATTERNS.aadhaar.error,
    pii: true,
    sensitive: true,
    helpText: 'Your Aadhaar number will be stored securely'
  },
  pan: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'ABCDE1234F',
    pattern: PATTERNS.pan.pattern,
    patternError: PATTERNS.pan.error,
    pii: true,
    maxLength: 10
  },
  gstin: {
    type: 'text',
    inputMode: 'text',
    placeholder: '22AAAAA0000A1Z5',
    pattern: PATTERNS.gstin.pattern,
    patternError: PATTERNS.gstin.error,
    pii: true,
    maxLength: 15
  },
  ifsc: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'SBIN0001234',
    pattern: PATTERNS.ifsc.pattern,
    patternError: PATTERNS.ifsc.error,
    maxLength: 11
  },
  upi: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'name@upi',
    pattern: PATTERNS.upi.pattern,
    patternError: PATTERNS.upi.error,
    pii: true
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AN', label: 'Andaman and Nicobar Islands' },
      { value: 'AP', label: 'Andhra Pradesh' },
      { value: 'AR', label: 'Arunachal Pradesh' },
      { value: 'AS', label: 'Assam' },
      { value: 'BR', label: 'Bihar' },
      { value: 'CH', label: 'Chandigarh' },
      { value: 'CT', label: 'Chhattisgarh' },
      { value: 'DN', label: 'Dadra and Nagar Haveli and Daman and Diu' },
      { value: 'DL', label: 'Delhi' },
      { value: 'GA', label: 'Goa' },
      { value: 'GJ', label: 'Gujarat' },
      { value: 'HR', label: 'Haryana' },
      { value: 'HP', label: 'Himachal Pradesh' },
      { value: 'JK', label: 'Jammu and Kashmir' },
      { value: 'JH', label: 'Jharkhand' },
      { value: 'KA', label: 'Karnataka' },
      { value: 'KL', label: 'Kerala' },
      { value: 'LA', label: 'Ladakh' },
      { value: 'LD', label: 'Lakshadweep' },
      { value: 'MP', label: 'Madhya Pradesh' },
      { value: 'MH', label: 'Maharashtra' },
      { value: 'MN', label: 'Manipur' },
      { value: 'ML', label: 'Meghalaya' },
      { value: 'MZ', label: 'Mizoram' },
      { value: 'NL', label: 'Nagaland' },
      { value: 'OR', label: 'Odisha' },
      { value: 'PY', label: 'Puducherry' },
      { value: 'PB', label: 'Punjab' },
      { value: 'RJ', label: 'Rajasthan' },
      { value: 'SK', label: 'Sikkim' },
      { value: 'TN', label: 'Tamil Nadu' },
      { value: 'TG', label: 'Telangana' },
      { value: 'TR', label: 'Tripura' },
      { value: 'UP', label: 'Uttar Pradesh' },
      { value: 'UK', label: 'Uttarakhand' },
      { value: 'WB', label: 'West Bengal' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '₹1,00,000',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Indian English field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'PIN Code',
  state: 'State/UT',
  nationalId: 'Aadhaar Number',
  phone: 'Phone Number',
  mobile: 'Mobile Number',
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name',
  streetAddress: 'Address',
  city: 'City/Town',
  district: 'District',
  email: 'Email Address',
  dateOfBirth: 'Date of Birth',
  company: 'Company Name',
  fatherName: "Father's Name"
};

/**
 * DPDP Act (Digital Personal Data Protection) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'I consent to the processing of my personal data in accordance with the Privacy Policy.'
};
