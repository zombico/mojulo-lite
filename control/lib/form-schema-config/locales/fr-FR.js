/**
 * French (fr-FR) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'fr-FR',
  name: 'France',
  region: 'EU',
  currency: 'EUR',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+33|0)[1-9](\\d{2}){4}$',
    error: 'Entrez un numéro de téléphone valide',
    description: 'French phone number'
  },
  postalCode: {
    pattern: '^\\d{5}$',
    error: 'Entrez un code postal valide (5 chiffres)',
    description: 'French postal code'
  },
  numeroSecuriteSociale: {
    pattern: '^[12]\\d{2}(0[1-9]|1[0-2])\\d{8}(\\d{2})?$',
    error: 'Entrez un numéro de sécurité sociale valide',
    description: 'French social security number (NIR)'
  },
  iban: {
    pattern: '^FR\\d{2}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{3}$',
    error: 'Entrez un IBAN français valide',
    description: 'French IBAN'
  },
  bic: {
    pattern: '^[A-Z]{4}FR[A-Z0-9]{2}([A-Z0-9]{3})?$',
    error: 'Entrez un code BIC valide',
    description: 'BIC/SWIFT code'
  },
  vatNumber: {
    pattern: '^FR[A-Z0-9]{2}\\d{9}$',
    error: 'Entrez un numéro de TVA valide',
    description: 'French VAT number (TVA)'
  },
  siret: {
    pattern: '^\\d{14}$',
    error: 'Entrez un numéro SIRET valide (14 chiffres)',
    description: 'SIRET number'
  },
  siren: {
    pattern: '^\\d{9}$',
    error: 'Entrez un numéro SIREN valide (9 chiffres)',
    description: 'SIREN number'
  },
  carteIdentite: {
    pattern: '^\\d{12}$',
    error: 'Entrez un numéro de carte d\'identité valide',
    description: 'French ID card number'
  },
  currency: {
    pattern: '^\\d{1,3}(\\s\\d{3})*(,\\d{2})?\\s?€?$',
    error: 'Entrez un montant valide',
    description: 'Euro amount (French format)'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '06 12 34 56 78',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '75001',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 5
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '1 85 12 75 108 123 45',
    pattern: PATTERNS.numeroSecuriteSociale.pattern,
    patternError: PATTERNS.numeroSecuriteSociale.error,
    pii: true,
    sensitive: true,
    helpText: 'Votre numéro de sécurité sociale sera gardé en sécurité'
  },
  iban: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'FR76 3000 6000 0112 3456 7890 189',
    pattern: PATTERNS.iban.pattern,
    patternError: PATTERNS.iban.error,
    pii: true
  },
  region: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'ARA', label: 'Auvergne-Rhône-Alpes' },
      { value: 'BFC', label: 'Bourgogne-Franche-Comté' },
      { value: 'BRE', label: 'Bretagne' },
      { value: 'CVL', label: 'Centre-Val de Loire' },
      { value: 'COR', label: 'Corse' },
      { value: 'GES', label: 'Grand Est' },
      { value: 'HDF', label: 'Hauts-de-France' },
      { value: 'IDF', label: 'Île-de-France' },
      { value: 'NOR', label: 'Normandie' },
      { value: 'NAQ', label: 'Nouvelle-Aquitaine' },
      { value: 'OCC', label: 'Occitanie' },
      { value: 'PDL', label: 'Pays de la Loire' },
      { value: 'PAC', label: 'Provence-Alpes-Côte d\'Azur' }
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
 * French-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Code postal',
  state: 'Région',
  nationalId: 'Numéro de sécurité sociale',
  phone: 'Téléphone',
  firstName: 'Prénom',
  lastName: 'Nom de famille',
  streetAddress: 'Adresse',
  city: 'Ville',
  email: 'Adresse e-mail',
  dateOfBirth: 'Date de naissance'
};

/**
 * GDPR compliance hints (strict for France)
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'J\'accepte le traitement de mes données personnelles conformément à la politique de confidentialité.'
};
