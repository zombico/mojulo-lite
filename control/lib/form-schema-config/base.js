/**
 * Base Form Schema Configuration
 * Universal patterns shared across all locales
 */

export const FIELD_TYPES = [
  'text', 'email', 'tel', 'date', 'number',
  'dropdown', 'checkbox', 'textarea', 'radio', 'url'
];

export const INPUT_MODES = {
  text: 'text',
  numeric: 'numeric',
  decimal: 'decimal',
  tel: 'tel',
  email: 'email',
  url: 'url',
  search: 'search'
};

/**
 * Universal validation patterns (locale-agnostic)
 */
export const BASE_PATTERNS = {
  email: {
    pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    error: 'Please enter a valid email address',
    description: 'Email address'
  },
  url: {
    pattern: '^https?:\\/\\/[\\w.-]+(?:\\.[\\w.-]+)+[\\w.,@?^=%&:/~+#-]*$',
    error: 'Please enter a valid URL',
    description: 'Web URL'
  },
  alphanumeric: {
    pattern: '^[a-zA-Z0-9]+$',
    error: 'Only letters and numbers allowed',
    description: 'Alphanumeric characters only'
  },
  numeric: {
    pattern: '^\\d+$',
    error: 'Only numbers allowed',
    description: 'Numeric digits only'
  }
};

/**
 * Universal autocomplete mappings
 */
export const BASE_AUTOCOMPLETE = {
  // Names
  fullName: 'name',
  firstName: 'given-name',
  lastName: 'family-name',
  middleName: 'additional-name',

  // Contact
  email: 'email',
  phone: 'tel',

  // Generic address
  streetAddress: 'street-address',
  addressLine1: 'address-line1',
  addressLine2: 'address-line2',
  city: 'address-level2',
  state: 'address-level1',
  postalCode: 'postal-code',
  country: 'country-name',

  // Personal
  birthday: 'bday',
  organization: 'organization',
  jobTitle: 'organization-title'
};

/**
 * Universal field archetypes (locale will override specific patterns)
 */
export const BASE_ARCHETYPES = {
  email: {
    type: 'email',
    autocomplete: 'email',
    inputMode: 'email',
    pattern: BASE_PATTERNS.email.pattern,
    patternError: BASE_PATTERNS.email.error,
    pii: true
  },
  fullName: {
    type: 'text',
    autocomplete: 'name',
    pii: true
  },
  firstName: {
    type: 'text',
    autocomplete: 'given-name',
    pii: true
  },
  lastName: {
    type: 'text',
    autocomplete: 'family-name',
    pii: true
  },
  dateOfBirth: {
    type: 'date',
    autocomplete: 'bday',
    pii: true
  },
  website: {
    type: 'url',
    inputMode: 'url',
    placeholder: 'https://',
    pattern: BASE_PATTERNS.url.pattern,
    patternError: BASE_PATTERNS.url.error
  },
  comments: {
    type: 'textarea',
    rows: 4,
    maxLength: 1000
  }
};

/**
 * PII field indicators - keywords that suggest PII
 */
export const PII_INDICATORS = [
  'name', 'fullName', 'firstName', 'lastName',
  'email', 'phone', 'mobile', 'cell', 'telephone',
  'address', 'street', 'postcode', 'postal', 'zip',
  'ssn', 'socialSecurity', 'sin', 'nationalInsurance', 'taxId',
  'dob', 'dateOfBirth', 'birthday', 'birthdate',
  'driverLicense', 'passport', 'nationalId',
  'creditCard', 'cardNumber', 'accountNumber',
  'bankAccount', 'iban', 'routingNumber',
  'salary', 'income'
];
