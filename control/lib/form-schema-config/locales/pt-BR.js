/**
 * Brazilian Portuguese (pt-BR) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'pt-BR',
  name: 'Brazil',
  region: 'South America',
  currency: 'BRL',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+55\\s?)?(\\(?\\d{2}\\)?\\s?)?\\d{4,5}-?\\d{4}$',
    error: 'Digite um telefone válido',
    description: 'Brazilian phone number'
  },
  mobile: {
    pattern: '^(\\+55\\s?)?(\\(?\\d{2}\\)?\\s?)?9\\d{4}-?\\d{4}$',
    error: 'Digite um celular válido',
    description: 'Brazilian mobile number'
  },
  postalCode: {
    pattern: '^\\d{5}-?\\d{3}$',
    error: 'Digite um CEP válido (ex: 01310-100)',
    description: 'Brazilian postal code (CEP)'
  },
  cpf: {
    pattern: '^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$',
    error: 'Digite um CPF válido',
    description: 'Individual taxpayer ID (CPF)'
  },
  cnpj: {
    pattern: '^\\d{2}\\.?\\d{3}\\.?\\d{3}\\/?\\d{4}-?\\d{2}$',
    error: 'Digite um CNPJ válido',
    description: 'Business taxpayer ID (CNPJ)'
  },
  rg: {
    pattern: '^[\\d\\w\\.\\-]+$',
    error: 'Digite um RG válido',
    description: 'Identity card (RG)'
  },
  bankAccount: {
    pattern: '^\\d{5,12}-?[\\dxX]$',
    error: 'Digite uma conta válida',
    description: 'Brazilian bank account'
  },
  bankAgency: {
    pattern: '^\\d{4}-?\\d?$',
    error: 'Digite uma agência válida',
    description: 'Bank agency number'
  },
  currency: {
    pattern: '^R\\$\\s?[\\d\\.]+,\\d{2}$',
    error: 'Digite um valor válido',
    description: 'Brazilian Real amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '(11) 91234-5678',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '01310-100',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 9
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '123.456.789-00',
    pattern: PATTERNS.cpf.pattern,
    patternError: PATTERNS.cpf.error,
    pii: true,
    sensitive: true,
    helpText: 'Seu CPF será armazenado com segurança'
  },
  cnpj: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '12.345.678/0001-90',
    pattern: PATTERNS.cnpj.pattern,
    patternError: PATTERNS.cnpj.error,
    pii: true
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AC', label: 'Acre' },
      { value: 'AL', label: 'Alagoas' },
      { value: 'AP', label: 'Amapá' },
      { value: 'AM', label: 'Amazonas' },
      { value: 'BA', label: 'Bahia' },
      { value: 'CE', label: 'Ceará' },
      { value: 'DF', label: 'Distrito Federal' },
      { value: 'ES', label: 'Espírito Santo' },
      { value: 'GO', label: 'Goiás' },
      { value: 'MA', label: 'Maranhão' },
      { value: 'MT', label: 'Mato Grosso' },
      { value: 'MS', label: 'Mato Grosso do Sul' },
      { value: 'MG', label: 'Minas Gerais' },
      { value: 'PA', label: 'Pará' },
      { value: 'PB', label: 'Paraíba' },
      { value: 'PR', label: 'Paraná' },
      { value: 'PE', label: 'Pernambuco' },
      { value: 'PI', label: 'Piauí' },
      { value: 'RJ', label: 'Rio de Janeiro' },
      { value: 'RN', label: 'Rio Grande do Norte' },
      { value: 'RS', label: 'Rio Grande do Sul' },
      { value: 'RO', label: 'Rondônia' },
      { value: 'RR', label: 'Roraima' },
      { value: 'SC', label: 'Santa Catarina' },
      { value: 'SP', label: 'São Paulo' },
      { value: 'SE', label: 'Sergipe' },
      { value: 'TO', label: 'Tocantins' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'R$ 100,00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Brazilian Portuguese field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'CEP',
  state: 'Estado',
  nationalId: 'CPF',
  phone: 'Telefone',
  mobile: 'Celular',
  firstName: 'Nome',
  lastName: 'Sobrenome',
  fullName: 'Nome completo',
  streetAddress: 'Endereço',
  city: 'Cidade',
  neighborhood: 'Bairro',
  email: 'E-mail',
  dateOfBirth: 'Data de nascimento',
  company: 'Empresa'
};

/**
 * LGPD (Lei Geral de Proteção de Dados) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'Concordo com o tratamento dos meus dados pessoais conforme a Política de Privacidade.'
};
