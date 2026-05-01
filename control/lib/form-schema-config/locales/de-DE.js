/**
 * German (de-DE) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'de-DE',
  name: 'Germany',
  region: 'EU',
  currency: 'EUR',
  dateFormat: 'DD.MM.YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+49|0)[1-9]\\d{1,14}$',
    error: 'Geben Sie eine gültige Telefonnummer ein',
    description: 'German phone number'
  },
  postalCode: {
    pattern: '^\\d{5}$',
    error: 'Geben Sie eine gültige PLZ ein (5 Ziffern)',
    description: 'German postal code (PLZ)'
  },
  steuerIdentifikationsnummer: {
    pattern: '^\\d{11}$',
    error: 'Geben Sie eine gültige Steuer-ID ein (11 Ziffern)',
    description: 'Tax identification number'
  },
  sozialversicherungsnummer: {
    pattern: '^\\d{2}[0-3]\\d[0-1]\\d{3}[A-Z]\\d{3}$',
    error: 'Geben Sie eine gültige Sozialversicherungsnummer ein',
    description: 'Social security number'
  },
  iban: {
    pattern: '^DE\\d{2}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{2}$',
    error: 'Geben Sie eine gültige deutsche IBAN ein',
    description: 'German IBAN'
  },
  bic: {
    pattern: '^[A-Z]{4}DE[A-Z0-9]{2}([A-Z0-9]{3})?$',
    error: 'Geben Sie eine gültige BIC ein',
    description: 'BIC/SWIFT code'
  },
  vatNumber: {
    pattern: '^DE\\d{9}$',
    error: 'Geben Sie eine gültige USt-IdNr. ein (DE + 9 Ziffern)',
    description: 'German VAT number (USt-IdNr.)'
  },
  personalausweis: {
    pattern: '^[CFGHJKLMNPRTVWXYZ0-9]{9}$',
    error: 'Geben Sie eine gültige Ausweisnummer ein',
    description: 'German ID card number'
  },
  currency: {
    pattern: '^\\d{1,3}(\\.\\d{3})*(,\\d{2})?\\s?€?$',
    error: 'Geben Sie einen gültigen Betrag ein',
    description: 'Euro amount (German format)'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '0151 12345678',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '10115',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 5
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '12345678901',
    pattern: PATTERNS.steuerIdentifikationsnummer.pattern,
    patternError: PATTERNS.steuerIdentifikationsnummer.error,
    pii: true,
    sensitive: true,
    helpText: 'Ihre Steuer-ID wird sicher aufbewahrt'
  },
  iban: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'DE89 3704 0044 0532 0130 00',
    pattern: PATTERNS.iban.pattern,
    patternError: PATTERNS.iban.error,
    pii: true
  },
  bundesland: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'BW', label: 'Baden-Württemberg' },
      { value: 'BY', label: 'Bayern' },
      { value: 'BE', label: 'Berlin' },
      { value: 'BB', label: 'Brandenburg' },
      { value: 'HB', label: 'Bremen' },
      { value: 'HH', label: 'Hamburg' },
      { value: 'HE', label: 'Hessen' },
      { value: 'MV', label: 'Mecklenburg-Vorpommern' },
      { value: 'NI', label: 'Niedersachsen' },
      { value: 'NW', label: 'Nordrhein-Westfalen' },
      { value: 'RP', label: 'Rheinland-Pfalz' },
      { value: 'SL', label: 'Saarland' },
      { value: 'SN', label: 'Sachsen' },
      { value: 'ST', label: 'Sachsen-Anhalt' },
      { value: 'SH', label: 'Schleswig-Holstein' },
      { value: 'TH', label: 'Thüringen' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '0,00 €',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * German-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'PLZ',
  state: 'Bundesland',
  nationalId: 'Steuer-Identifikationsnummer',
  phone: 'Telefonnummer',
  firstName: 'Vorname',
  lastName: 'Nachname',
  streetAddress: 'Straße und Hausnummer',
  city: 'Stadt/Ort',
  email: 'E-Mail-Adresse'
};

/**
 * GDPR compliance hints (strict for Germany)
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'Ich stimme der Verarbeitung meiner personenbezogenen Daten gemäß der Datenschutzerklärung zu.'
};
