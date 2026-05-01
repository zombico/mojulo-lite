/**
 * Spanish (es-ES) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'es-ES',
  name: 'Spain',
  region: 'EU',
  currency: 'EUR',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+34|0034)?[6789]\\d{8}$',
    error: 'Introduce un número de teléfono válido',
    description: 'Spanish phone number'
  },
  postalCode: {
    pattern: '^(0[1-9]|[1-4]\\d|5[0-2])\\d{3}$',
    error: 'Introduce un código postal válido (ej. 28001)',
    description: 'Spanish postal code'
  },
  dni: {
    pattern: '^\\d{8}[A-Z]$',
    error: 'Introduce un DNI válido (8 dígitos y una letra)',
    description: 'Documento Nacional de Identidad (DNI)'
  },
  nie: {
    pattern: '^[XYZ]\\d{7}[A-Z]$',
    error: 'Introduce un NIE válido',
    description: 'Número de Identidad de Extranjero (NIE)'
  },
  iban: {
    pattern: '^ES\\d{22}$',
    error: 'Introduce un IBAN español válido',
    description: 'Spanish IBAN'
  },
  bic: {
    pattern: '^[A-Z]{4}ES[A-Z0-9]{2}([A-Z0-9]{3})?$',
    error: 'Introduce un BIC válido',
    description: 'BIC/SWIFT code'
  },
  vatNumber: {
    pattern: '^ES[A-Z0-9]\\d{7}[A-Z0-9]$',
    error: 'Introduce un NIF/CIF válido',
    description: 'Spanish VAT number (NIF/CIF)'
  },
  cif: {
    pattern: '^[ABCDEFGHJNPQRSUVW]\\d{7}[A-J0-9]$',
    error: 'Introduce un CIF válido',
    description: 'Código de Identificación Fiscal (CIF)'
  },
  socialSecurity: {
    pattern: '^\\d{12}$',
    error: 'Introduce un número de Seguridad Social válido',
    description: 'Spanish Social Security Number'
  },
  currency: {
    pattern: '^€?\\s?\\d{1,3}(\\.\\d{3})*(,\\d{2})?$',
    error: 'Introduce un importe válido',
    description: 'Euro amount (Spanish format)'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '612 345 678',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '28001',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 5
  },
  nationalId: {
    type: 'text',
    inputMode: 'text',
    placeholder: '12345678A',
    pattern: PATTERNS.dni.pattern,
    patternError: PATTERNS.dni.error,
    pii: true,
    sensitive: true,
    helpText: 'Tu DNI se almacenará de forma segura'
  },
  nie: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'X1234567A',
    pattern: PATTERNS.nie.pattern,
    patternError: PATTERNS.nie.error,
    pii: true,
    sensitive: true,
    helpText: 'Tu NIE se almacenará de forma segura'
  },
  iban: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'ES9121000418450200051332',
    pattern: PATTERNS.iban.pattern,
    patternError: PATTERNS.iban.error,
    pii: true
  },
  comunidadAutonoma: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AN', label: 'Andalucía' },
      { value: 'AR', label: 'Aragón' },
      { value: 'AS', label: 'Asturias' },
      { value: 'IB', label: 'Baleares' },
      { value: 'CN', label: 'Canarias' },
      { value: 'CB', label: 'Cantabria' },
      { value: 'CL', label: 'Castilla y León' },
      { value: 'CM', label: 'Castilla-La Mancha' },
      { value: 'CT', label: 'Cataluña' },
      { value: 'CE', label: 'Ceuta' },
      { value: 'VC', label: 'Comunidad Valenciana' },
      { value: 'EX', label: 'Extremadura' },
      { value: 'GA', label: 'Galicia' },
      { value: 'MD', label: 'Madrid' },
      { value: 'ML', label: 'Melilla' },
      { value: 'MC', label: 'Murcia' },
      { value: 'NC', label: 'Navarra' },
      { value: 'PV', label: 'País Vasco' },
      { value: 'RI', label: 'La Rioja' }
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
 * Spanish-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Código postal',
  state: 'Comunidad Autónoma',
  nationalId: 'DNI',
  phone: 'Teléfono',
  firstName: 'Nombre',
  lastName: 'Apellidos',
  streetAddress: 'Dirección',
  city: 'Ciudad',
  email: 'Correo electrónico',
  dateOfBirth: 'Fecha de nacimiento'
};

/**
 * GDPR compliance hints (strict for Spain/EU)
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'Acepto el tratamiento de mis datos personales conforme a la política de privacidad.'
};
