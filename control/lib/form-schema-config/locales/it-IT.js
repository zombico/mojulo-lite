/**
 * Italian (it-IT) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'it-IT',
  name: 'Italy',
  region: 'EU',
  currency: 'EUR',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+39)?\\s?[0-9]{2,4}[\\s-]?[0-9]{4,8}$',
    error: 'Inserisci un numero di telefono valido',
    description: 'Italian phone number'
  },
  postalCode: {
    pattern: '^\\d{5}$',
    error: 'Inserisci un CAP valido (5 cifre)',
    description: 'Italian postal code (CAP)'
  },
  codiceFiscale: {
    pattern: '^[A-Z]{6}\\d{2}[A-Z]\\d{2}[A-Z]\\d{3}[A-Z]$',
    error: 'Inserisci un codice fiscale valido',
    description: 'Italian tax code (Codice Fiscale)'
  },
  partitaIva: {
    pattern: '^IT\\d{11}$',
    error: 'Inserisci una partita IVA valida (IT + 11 cifre)',
    description: 'Italian VAT number (Partita IVA)'
  },
  iban: {
    pattern: '^IT\\d{2}[A-Z]\\d{10}[A-Z0-9]{12}$',
    error: 'Inserisci un IBAN italiano valido',
    description: 'Italian IBAN'
  },
  bic: {
    pattern: '^[A-Z]{4}IT[A-Z0-9]{2}([A-Z0-9]{3})?$',
    error: 'Inserisci un codice BIC valido',
    description: 'BIC/SWIFT code'
  },
  cartaIdentita: {
    pattern: '^[A-Z]{2}\\d{7}$',
    error: 'Inserisci un numero di carta d\'identità valido',
    description: 'Italian ID card number'
  },
  tessaraSanitaria: {
    pattern: '^[A-Z]{6}\\d{2}[A-Z]\\d{2}[A-Z]\\d{3}[A-Z]$',
    error: 'Inserisci un numero di tessera sanitaria valido',
    description: 'Italian health card number'
  },
  currency: {
    pattern: '^\\d{1,3}(\\.\\d{3})*(,\\d{2})?\\s?€?$',
    error: 'Inserisci un importo valido',
    description: 'Euro amount (Italian format)'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '333 1234567',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '00100',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 5
  },
  nationalId: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'RSSMRA85M01H501Z',
    pattern: PATTERNS.codiceFiscale.pattern,
    patternError: PATTERNS.codiceFiscale.error,
    pii: true,
    sensitive: true,
    helpText: 'Il tuo codice fiscale sarà conservato in modo sicuro'
  },
  iban: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'IT60X0542811101000000123456',
    pattern: PATTERNS.iban.pattern,
    patternError: PATTERNS.iban.error,
    pii: true
  },
  regione: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'ABR', label: 'Abruzzo' },
      { value: 'BAS', label: 'Basilicata' },
      { value: 'CAL', label: 'Calabria' },
      { value: 'CAM', label: 'Campania' },
      { value: 'EMR', label: 'Emilia-Romagna' },
      { value: 'FVG', label: 'Friuli Venezia Giulia' },
      { value: 'LAZ', label: 'Lazio' },
      { value: 'LIG', label: 'Liguria' },
      { value: 'LOM', label: 'Lombardia' },
      { value: 'MAR', label: 'Marche' },
      { value: 'MOL', label: 'Molise' },
      { value: 'PMN', label: 'Piemonte' },
      { value: 'PUG', label: 'Puglia' },
      { value: 'SAR', label: 'Sardegna' },
      { value: 'SIC', label: 'Sicilia' },
      { value: 'TOS', label: 'Toscana' },
      { value: 'TAA', label: 'Trentino-Alto Adige' },
      { value: 'UMB', label: 'Umbria' },
      { value: 'VDA', label: 'Valle d\'Aosta' },
      { value: 'VEN', label: 'Veneto' }
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
 * Italian-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'CAP',
  state: 'Regione',
  nationalId: 'Codice Fiscale',
  phone: 'Telefono',
  firstName: 'Nome',
  lastName: 'Cognome',
  streetAddress: 'Indirizzo',
  city: 'Città',
  email: 'Indirizzo email',
  dateOfBirth: 'Data di nascita'
};

/**
 * GDPR compliance hints (strict for Italy/EU)
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'Acconsento al trattamento dei miei dati personali in conformità con l\'informativa sulla privacy.'
};
