/**
 * Arabic - UAE (ar-AE) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'ar-AE',
  name: 'United Arab Emirates',
  region: 'Middle East',
  currency: 'AED',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+971|0)\\s?5[0-9]\\s?\\d{3}\\s?\\d{4}$',
    error: 'يرجى إدخال رقم هاتف صحيح',
    description: 'UAE mobile number'
  },
  landline: {
    pattern: '^(\\+971|0)\\s?[2-9]\\s?\\d{3}\\s?\\d{4}$',
    error: 'يرجى إدخال رقم هاتف أرضي صحيح',
    description: 'UAE landline number'
  },
  emiratesId: {
    pattern: '^784-?\\d{4}-?\\d{7}-?\\d{1}$',
    error: 'يرجى إدخال رقم الهوية الإماراتية الصحيح',
    description: 'Emirates ID number'
  },
  trn: {
    pattern: '^\\d{15}$',
    error: 'يرجى إدخال الرقم الضريبي الصحيح (15 رقم)',
    description: 'Tax Registration Number'
  },
  tradeLicense: {
    pattern: '^\\d{6,10}$',
    error: 'يرجى إدخال رقم الرخصة التجارية الصحيح',
    description: 'Trade License Number'
  },
  poBox: {
    pattern: '^\\d{3,6}$',
    error: 'يرجى إدخال رقم صندوق البريد الصحيح',
    description: 'PO Box number'
  },
  iban: {
    pattern: '^AE\\d{2}\\s?\\d{3}\\s?\\d{16}$',
    error: 'يرجى إدخال رقم IBAN صحيح',
    description: 'UAE IBAN'
  },
  currency: {
    pattern: '^(AED|د\\.إ\\.?)\\s?[\\d,]+(\\.\\d{2})?$',
    error: 'يرجى إدخال مبلغ صحيح',
    description: 'UAE Dirham amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '050 123 4567',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '12345',
    pattern: PATTERNS.poBox.pattern,
    patternError: PATTERNS.poBox.error,
    helpText: 'رقم صندوق البريد'
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '784-1234-1234567-1',
    pattern: PATTERNS.emiratesId.pattern,
    patternError: PATTERNS.emiratesId.error,
    pii: true,
    sensitive: true,
    helpText: 'سيتم حفظ رقم الهوية الإماراتية بشكل آمن'
  },
  iban: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'AE07 033 1234567890123456',
    pattern: PATTERNS.iban.pattern,
    patternError: PATTERNS.iban.error,
    pii: true
  },
  emirate: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AUH', label: 'أبوظبي (Abu Dhabi)' },
      { value: 'DXB', label: 'دبي (Dubai)' },
      { value: 'SHJ', label: 'الشارقة (Sharjah)' },
      { value: 'AJM', label: 'عجمان (Ajman)' },
      { value: 'UAQ', label: 'أم القيوين (Umm Al Quwain)' },
      { value: 'RAK', label: 'رأس الخيمة (Ras Al Khaimah)' },
      { value: 'FUJ', label: 'الفجيرة (Fujairah)' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'AED 1,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Arabic (UAE) field name mappings - bilingual for business use
 */
export const FIELD_LABELS = {
  postalCode: 'صندوق البريد / PO Box',
  state: 'الإمارة / Emirate',
  nationalId: 'رقم الهوية الإماراتية / Emirates ID',
  phone: 'رقم الهاتف / Phone',
  mobile: 'رقم الجوال / Mobile',
  firstName: 'الاسم الأول / First Name',
  lastName: 'اسم العائلة / Last Name',
  fullName: 'الاسم الكامل / Full Name',
  streetAddress: 'العنوان / Address',
  city: 'المدينة / City',
  email: 'البريد الإلكتروني / Email',
  dateOfBirth: 'تاريخ الميلاد / Date of Birth',
  company: 'اسم الشركة / Company Name'
};

/**
 * UAE data protection compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'أوافق على معالجة بياناتي الشخصية وفقاً لسياسة الخصوصية. / I consent to the processing of my personal data in accordance with the Privacy Policy.'
};
