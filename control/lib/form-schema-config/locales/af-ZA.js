/**
 * South African Afrikaans (af-ZA) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'af-ZA',
  name: 'South Africa',
  region: 'Africa',
  currency: 'ZAR',
  dateFormat: 'YYYY/MM/DD'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+27|0)[1-9]\\d{8}$',
    error: 'Voer asseblief \'n geldige telefoonnommer in',
    description: 'South African phone number'
  },
  postalCode: {
    pattern: '^\\d{4}$',
    error: 'Voer asseblief \'n geldige poskode in (4 syfers)',
    description: 'South African postal code'
  },
  idNumber: {
    pattern: '^\\d{13}$',
    error: 'Voer asseblief \'n geldige ID-nommer in (13 syfers)',
    description: 'South African ID number'
  },
  passportNumber: {
    pattern: '^[A-Z]\\d{8}$',
    error: 'Voer asseblief \'n geldige paspoortnommer in',
    description: 'South African passport number'
  },
  bankAccountNumber: {
    pattern: '^\\d{9,12}$',
    error: 'Voer asseblief \'n geldige bankrekeningnommer in',
    description: 'South African bank account number'
  },
  branchCode: {
    pattern: '^\\d{6}$',
    error: 'Voer asseblief \'n geldige takkode in (6 syfers)',
    description: 'South African bank branch code'
  },
  vatNumber: {
    pattern: '^4\\d{9}$',
    error: 'Voer asseblief \'n geldige BTW-nommer in (begin met 4, 10 syfers)',
    description: 'South African VAT number'
  },
  companyRegistration: {
    pattern: '^\\d{4}\\/\\d{6}\\/\\d{2}$',
    error: 'Voer asseblief \'n geldige maatskappyregistrasienommer in (bv. 2020/123456/07)',
    description: 'South African company registration number'
  },
  currency: {
    pattern: '^R?\\s?\\d{1,3}(\\s?\\d{3})*([,.]\\d{2})?$',
    error: 'Voer asseblief \'n geldige bedrag in',
    description: 'South African Rand amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '082 123 4567',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '0001',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 4
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '8001015009087',
    pattern: PATTERNS.idNumber.pattern,
    patternError: PATTERNS.idNumber.error,
    pii: true,
    sensitive: true,
    helpText: 'Jou ID-nommer word veilig bewaar'
  },
  bankAccount: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '123456789',
    pattern: PATTERNS.bankAccountNumber.pattern,
    patternError: PATTERNS.bankAccountNumber.error,
    pii: true
  },
  branchCode: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '250655',
    pattern: PATTERNS.branchCode.pattern,
    patternError: PATTERNS.branchCode.error,
    maxLength: 6
  },
  province: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'EC', label: 'Oos-Kaap' },
      { value: 'FS', label: 'Vrystaat' },
      { value: 'GP', label: 'Gauteng' },
      { value: 'KZN', label: 'KwaZulu-Natal' },
      { value: 'LP', label: 'Limpopo' },
      { value: 'MP', label: 'Mpumalanga' },
      { value: 'NC', label: 'Noord-Kaap' },
      { value: 'NW', label: 'Noordwes' },
      { value: 'WC', label: 'Wes-Kaap' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'R 0,00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Afrikaans field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Poskode',
  state: 'Provinsie',
  nationalId: 'ID-nommer',
  phone: 'Telefoonnommer',
  firstName: 'Voornaam',
  lastName: 'Van',
  streetAddress: 'Straatadres',
  city: 'Stad/Dorp',
  email: 'E-posadres'
};

/**
 * POPIA compliance hints (South Africa's Protection of Personal Information Act)
 */
export const POPIA_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'Ek stem in tot die verwerking van my persoonlike inligting in ooreenstemming met die privaatheidsbeleid.'
};
