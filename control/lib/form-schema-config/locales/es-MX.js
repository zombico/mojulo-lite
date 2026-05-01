/**
 * Mexican Spanish (es-MX) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'es-MX',
  name: 'Mexico',
  region: 'North America',
  currency: 'MXN',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+52\\s?)?(\\(?\\d{2,3}\\)?\\s?)?\\d{3,4}[\\s-]?\\d{4}$',
    error: 'Ingrese un número de teléfono válido',
    description: 'Mexican phone number'
  },
  mobile: {
    pattern: '^(\\+52\\s?)?1?\\s?\\d{10}$',
    error: 'Ingrese un número de celular válido',
    description: 'Mexican mobile number'
  },
  postalCode: {
    pattern: '^\\d{5}$',
    error: 'Ingrese un código postal válido (5 dígitos)',
    description: 'Mexican postal code'
  },
  curp: {
    pattern: '^[A-Z]{4}\\d{6}[HM][A-Z]{5}[A-Z\\d]\\d$',
    error: 'Ingrese una CURP válida (18 caracteres)',
    description: 'Clave Única de Registro de Población'
  },
  rfc: {
    pattern: '^[A-ZÑ&]{3,4}\\d{6}[A-Z\\d]{3}$',
    error: 'Ingrese un RFC válido',
    description: 'Registro Federal de Contribuyentes'
  },
  rfcPersona: {
    pattern: '^[A-ZÑ&]{4}\\d{6}[A-Z\\d]{3}$',
    error: 'Ingrese un RFC válido (persona física)',
    description: 'RFC for individuals (13 chars)'
  },
  rfcEmpresa: {
    pattern: '^[A-ZÑ&]{3}\\d{6}[A-Z\\d]{3}$',
    error: 'Ingrese un RFC válido (persona moral)',
    description: 'RFC for companies (12 chars)'
  },
  nss: {
    pattern: '^\\d{11}$',
    error: 'Ingrese un NSS válido (11 dígitos)',
    description: 'Número de Seguro Social'
  },
  clabe: {
    pattern: '^\\d{18}$',
    error: 'Ingrese una CLABE válida (18 dígitos)',
    description: 'Interbank CLABE'
  },
  ine: {
    pattern: '^\\d{13}$',
    error: 'Ingrese un número de INE válido',
    description: 'INE/IFE voter ID number'
  },
  currency: {
    pattern: '^\\$?[\\d,]+(\\.\\d{2})?$',
    error: 'Ingrese un monto válido',
    description: 'Mexican Peso amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '55 1234 5678',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '06600',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 5
  },
  nationalId: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'GARC850101HDFRRL09',
    pattern: PATTERNS.curp.pattern,
    patternError: PATTERNS.curp.error,
    pii: true,
    sensitive: true,
    helpText: 'Tu CURP se almacenará de forma segura',
    maxLength: 18
  },
  rfc: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'GARC850101ABC',
    pattern: PATTERNS.rfc.pattern,
    patternError: PATTERNS.rfc.error,
    pii: true
  },
  clabe: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '012345678901234567',
    pattern: PATTERNS.clabe.pattern,
    patternError: PATTERNS.clabe.error,
    pii: true,
    maxLength: 18
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AGU', label: 'Aguascalientes' },
      { value: 'BCN', label: 'Baja California' },
      { value: 'BCS', label: 'Baja California Sur' },
      { value: 'CAM', label: 'Campeche' },
      { value: 'CHP', label: 'Chiapas' },
      { value: 'CHH', label: 'Chihuahua' },
      { value: 'COA', label: 'Coahuila' },
      { value: 'COL', label: 'Colima' },
      { value: 'CMX', label: 'Ciudad de México' },
      { value: 'DUR', label: 'Durango' },
      { value: 'GUA', label: 'Guanajuato' },
      { value: 'GRO', label: 'Guerrero' },
      { value: 'HID', label: 'Hidalgo' },
      { value: 'JAL', label: 'Jalisco' },
      { value: 'MEX', label: 'Estado de México' },
      { value: 'MIC', label: 'Michoacán' },
      { value: 'MOR', label: 'Morelos' },
      { value: 'NAY', label: 'Nayarit' },
      { value: 'NLE', label: 'Nuevo León' },
      { value: 'OAX', label: 'Oaxaca' },
      { value: 'PUE', label: 'Puebla' },
      { value: 'QUE', label: 'Querétaro' },
      { value: 'ROO', label: 'Quintana Roo' },
      { value: 'SLP', label: 'San Luis Potosí' },
      { value: 'SIN', label: 'Sinaloa' },
      { value: 'SON', label: 'Sonora' },
      { value: 'TAB', label: 'Tabasco' },
      { value: 'TAM', label: 'Tamaulipas' },
      { value: 'TLA', label: 'Tlaxcala' },
      { value: 'VER', label: 'Veracruz' },
      { value: 'YUC', label: 'Yucatán' },
      { value: 'ZAC', label: 'Zacatecas' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '$1,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Mexican Spanish field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'Código postal',
  state: 'Estado',
  nationalId: 'CURP',
  phone: 'Teléfono',
  mobile: 'Celular',
  firstName: 'Nombre(s)',
  lastName: 'Apellidos',
  fullName: 'Nombre completo',
  streetAddress: 'Dirección',
  city: 'Ciudad',
  neighborhood: 'Colonia',
  email: 'Correo electrónico',
  dateOfBirth: 'Fecha de nacimiento',
  company: 'Empresa'
};

/**
 * Mexican data protection (LFPDPPP) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'Acepto el tratamiento de mis datos personales conforme al Aviso de Privacidad.'
};
