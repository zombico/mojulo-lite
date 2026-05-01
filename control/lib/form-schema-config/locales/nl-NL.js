/**
 * Dutch (nl-NL) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'nl-NL',
  name: 'Netherlands',
  region: 'EU',
  currency: 'EUR',
  dateFormat: 'DD-MM-YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+31|0)[1-9]\\d{8}$',
    error: 'Voer een geldig telefoonnummer in',
    description: 'Dutch phone number'
  },
  postalCode: {
    pattern: '^[1-9]\\d{3}\\s?[A-Z]{2}$',
    error: 'Voer een geldige postcode in (bijv. 1234 AB)',
    description: 'Dutch postal code'
  },
  bsn: {
    pattern: '^\\d{9}$',
    error: 'Voer een geldig BSN in (9 cijfers)',
    description: 'Burgerservicenummer (BSN)'
  },
  iban: {
    pattern: '^NL\\d{2}[A-Z]{4}\\d{10}$',
    error: 'Voer een geldige Nederlandse IBAN in',
    description: 'Dutch IBAN'
  },
  bic: {
    pattern: '^[A-Z]{4}NL[A-Z0-9]{2}([A-Z0-9]{3})?$',
    error: 'Voer een geldige BIC in',
    description: 'BIC/SWIFT code'
  },
  vatNumber: {
    pattern: '^NL\\d{9}B\\d{2}$',
    error: 'Voer een geldig BTW-nummer in',
    description: 'Dutch VAT number (BTW-nummer)'
  },
  kvkNumber: {
    pattern: '^\\d{8}$',
    error: 'Voer een geldig KvK-nummer in (8 cijfers)',
    description: 'Chamber of Commerce number (KvK)'
  },
  idCard: {
    pattern: '^[A-Z]{2}[A-Z0-9]{6}\\d$',
    error: 'Voer een geldig identiteitskaartnummer in',
    description: 'Dutch ID card number'
  },
  currency: {
    pattern: '^€?\\s?\\d{1,3}(\\.\\d{3})*(,\\d{2})?$',
    error: 'Voer een geldig bedrag in',
    description: 'Euro amount (Dutch format)'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '06 12345678',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'text',
    placeholder: '1234 AB',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 7
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '123456789',
    pattern: PATTERNS.bsn.pattern,
    patternError: PATTERNS.bsn.error,
    pii: true,
    sensitive: true,
    helpText: 'Uw BSN wordt veilig bewaard'
  },
  iban: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'NL91ABNA0417164300',
    pattern: PATTERNS.iban.pattern,
    patternError: PATTERNS.iban.error,
    pii: true
  },
  provincie: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'DR', label: 'Drenthe' },
      { value: 'FL', label: 'Flevoland' },
      { value: 'FR', label: 'Friesland' },
      { value: 'GE', label: 'Gelderland' },
      { value: 'GR', label: 'Groningen' },
      { value: 'LI', label: 'Limburg' },
      { value: 'NB', label: 'Noord-Brabant' },
      { value: 'NH', label: 'Noord-Holland' },
      { value: 'OV', label: 'Overijssel' },
      { value: 'UT', label: 'Utrecht' },
      { value: 'ZE', label: 'Zeeland' },
      { value: 'ZH', label: 'Zuid-Holland' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '€ 0,00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Dutch-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Postcode',
  state: 'Provincie',
  nationalId: 'Burgerservicenummer (BSN)',
  phone: 'Telefoonnummer',
  firstName: 'Voornaam',
  lastName: 'Achternaam',
  streetAddress: 'Straat en huisnummer',
  city: 'Plaats',
  email: 'E-mailadres',
  dateOfBirth: 'Geboortedatum'
};

/**
 * GDPR compliance hints (strict for Netherlands/EU)
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'Ik ga akkoord met de verwerking van mijn persoonsgegevens conform het privacybeleid.'
};
