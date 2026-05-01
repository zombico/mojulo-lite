/**
 * US English (en-US) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'en-US',
  name: 'United States',
  region: 'NA',
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+1)?[-.\\s]?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}$',
    error: 'Enter a valid US phone number',
    description: 'US phone number'
  },
  postalCode: {
    pattern: '^\\d{5}(-\\d{4})?$',
    error: 'Enter a valid ZIP code (e.g., 12345 or 12345-6789)',
    description: 'US ZIP code'
  },
  ssn: {
    pattern: '^\\d{3}-?\\d{2}-?\\d{4}$',
    error: 'Enter a valid SSN (XXX-XX-XXXX)',
    description: 'Social Security Number'
  },
  stateCode: {
    pattern: '^[A-Z]{2}$',
    error: 'Enter a 2-letter state code',
    description: 'US state code'
  },
  currency: {
    pattern: '^\\$?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$',
    error: 'Enter a valid dollar amount',
    description: 'US currency'
  },
  routingNumber: {
    pattern: '^\\d{9}$',
    error: 'Enter a 9-digit routing number',
    description: 'Bank routing number'
  },
  accountNumber: {
    pattern: '^\\d{4,17}$',
    error: 'Enter a valid account number',
    description: 'Bank account number'
  },
  driversLicense: {
    pattern: '^[A-Z0-9]{4,16}$',
    error: 'Enter a valid driver\'s license number',
    description: 'US driver\'s license (varies by state)'
  },
  ein: {
    pattern: '^\\d{2}-?\\d{7}$',
    error: 'Enter a valid EIN (XX-XXXXXXX)',
    description: 'Employer Identification Number'
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
    inputMode: 'numeric',
    placeholder: '12345',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 10
  },
  ssn: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: 'XXX-XX-XXXX',
    pattern: PATTERNS.ssn.pattern,
    patternError: PATTERNS.ssn.error,
    pii: true,
    sensitive: true,
    helpText: 'Your Social Security Number will be kept secure'
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' },
      { value: 'AZ', label: 'Arizona' }, { value: 'AR', label: 'Arkansas' },
      { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
      { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' },
      { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' },
      { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
      { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' },
      { value: 'IA', label: 'Iowa' }, { value: 'KS', label: 'Kansas' },
      { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
      { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
      { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' },
      { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
      { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' },
      { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' },
      { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
      { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' },
      { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' },
      { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
      { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' },
      { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' },
      { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
      { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' },
      { value: 'VT', label: 'Vermont' }, { value: 'VA', label: 'Virginia' },
      { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
      { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' },
      { value: 'DC', label: 'District of Columbia' }
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
 * US-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'ZIP Code',
  state: 'State',
  nationalId: 'Social Security Number (SSN)'
};
