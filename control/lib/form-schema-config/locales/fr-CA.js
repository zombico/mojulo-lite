/**
 * Canadian French (fr-CA) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'fr-CA',
  name: 'Canada (Français)',
  region: 'NA',
  currency: 'CAD',
  dateFormat: 'YYYY-MM-DD'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+1)?[-.\\s]?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}$',
    error: 'Entrez un numéro de téléphone valide',
    description: 'Canadian phone number'
  },
  postalCode: {
    pattern: '^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$',
    error: 'Entrez un code postal valide (ex: A1A 1A1)',
    description: 'Canadian postal code'
  },
  sin: {
    pattern: '^\\d{3}[- ]?\\d{3}[- ]?\\d{3}$',
    error: 'Entrez un NAS valide (XXX-XXX-XXX)',
    description: 'Social Insurance Number (NAS)'
  },
  provinceCode: {
    pattern: '^[A-Z]{2}$',
    error: 'Entrez un code de province à 2 lettres',
    description: 'Canadian province code'
  },
  currency: {
    pattern: '^\\d{1,3}(\\s\\d{3})*(,\\d{2})?\\s?\\$?$',
    error: 'Entrez un montant valide',
    description: 'Canadian currency (French format)'
  },
  driversLicense: {
    pattern: '^[A-Z0-9]{5,15}$',
    error: 'Entrez un numéro de permis de conduire valide',
    description: 'Canadian driver\'s license (varies by province)'
  },
  healthCard: {
    pattern: '^[A-Z0-9]{10,14}$',
    error: 'Entrez un numéro de carte santé valide',
    description: 'Provincial health card number'
  },
  ramq: {
    pattern: '^[A-Z]{4}\\d{8}$',
    error: 'Entrez un numéro RAMQ valide',
    description: 'Quebec health insurance number (RAMQ)'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '(514) 555-5555',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'text',
    placeholder: 'H2X 1Y4',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 7
  },
  sin: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: 'XXX-XXX-XXX',
    pattern: PATTERNS.sin.pattern,
    patternError: PATTERNS.sin.error,
    pii: true,
    sensitive: true,
    helpText: 'Votre numéro d\'assurance sociale sera conservé en toute sécurité'
  },
  province: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AB', label: 'Alberta' },
      { value: 'BC', label: 'Colombie-Britannique' },
      { value: 'MB', label: 'Manitoba' },
      { value: 'NB', label: 'Nouveau-Brunswick' },
      { value: 'NL', label: 'Terre-Neuve-et-Labrador' },
      { value: 'NS', label: 'Nouvelle-Écosse' },
      { value: 'NT', label: 'Territoires du Nord-Ouest' },
      { value: 'NU', label: 'Nunavut' },
      { value: 'ON', label: 'Ontario' },
      { value: 'PE', label: 'Île-du-Prince-Édouard' },
      { value: 'QC', label: 'Québec' },
      { value: 'SK', label: 'Saskatchewan' },
      { value: 'YT', label: 'Yukon' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '0,00 $',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * French Canadian-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Code postal',
  state: 'Province',
  nationalId: 'Numéro d\'assurance sociale (NAS)',
  phone: 'Téléphone',
  firstName: 'Prénom',
  lastName: 'Nom de famille',
  streetAddress: 'Adresse',
  city: 'Ville',
  email: 'Adresse courriel',
  dateOfBirth: 'Date de naissance',
  fullName: 'Nom complet'
};

/**
 * Canada has PIPEDA (similar to but less strict than GDPR)
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: false,
  explicitConsentLanguage: 'Je consens au traitement de mes renseignements personnels conformément à la politique de confidentialité.'
};
