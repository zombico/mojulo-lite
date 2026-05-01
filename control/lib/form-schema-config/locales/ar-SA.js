/**
 * Arabic - Saudi Arabia (ar-SA) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'ar-SA',
  name: 'Saudi Arabia',
  region: 'Middle East',
  currency: 'SAR',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+966|0)\\s?5[0-9]\\s?\\d{3}\\s?\\d{4}$',
    error: 'يرجى إدخال رقم جوال صحيح',
    description: 'Saudi mobile number'
  },
  landline: {
    pattern: '^(\\+966|0)\\s?1[1-9]\\s?\\d{3}\\s?\\d{4}$',
    error: 'يرجى إدخال رقم هاتف أرضي صحيح',
    description: 'Saudi landline number'
  },
  nationalId: {
    pattern: '^[12]\\d{9}$',
    error: 'يرجى إدخال رقم الهوية الوطنية أو الإقامة الصحيح (10 أرقام)',
    description: 'Saudi National ID (starts with 1) or Iqama (starts with 2)'
  },
  vatNumber: {
    pattern: '^3\\d{14}$',
    error: 'يرجى إدخال الرقم الضريبي الصحيح (15 رقم يبدأ بـ 3)',
    description: 'Saudi VAT number'
  },
  commercialRegistration: {
    pattern: '^\\d{10}$',
    error: 'يرجى إدخال رقم السجل التجاري الصحيح (10 أرقام)',
    description: 'Commercial Registration (CR) number'
  },
  postalCode: {
    pattern: '^\\d{5}$',
    error: 'يرجى إدخال الرمز البريدي الصحيح (5 أرقام)',
    description: 'Saudi postal code'
  },
  poBox: {
    pattern: '^\\d{3,6}$',
    error: 'يرجى إدخال رقم صندوق البريد الصحيح',
    description: 'PO Box number'
  },
  iban: {
    pattern: '^SA\\d{2}\\s?\\d{2}\\s?[A-Z0-9]{18}$',
    error: 'يرجى إدخال رقم الآيبان الصحيح',
    description: 'Saudi IBAN'
  },
  currency: {
    pattern: '^(SAR|ر\\.س\\.?)\\s?[\\d,]+(\\.\\d{2})?$',
    error: 'يرجى إدخال مبلغ صحيح',
    description: 'Saudi Riyal amount'
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
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 5
  },
  poBox: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '12345',
    pattern: PATTERNS.poBox.pattern,
    patternError: PATTERNS.poBox.error,
    helpText: 'رقم صندوق البريد'
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '1234567890',
    pattern: PATTERNS.nationalId.pattern,
    patternError: PATTERNS.nationalId.error,
    pii: true,
    sensitive: true,
    helpText: 'سيتم حفظ رقم الهوية بشكل آمن'
  },
  iban: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'SA03 80 000000608010167519',
    pattern: PATTERNS.iban.pattern,
    patternError: PATTERNS.iban.error,
    pii: true
  },
  region: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'RUH', label: 'الرياض (Riyadh)' },
      { value: 'MKH', label: 'مكة المكرمة (Makkah)' },
      { value: 'MDN', label: 'المدينة المنورة (Madinah)' },
      { value: 'QSM', label: 'القصيم (Qassim)' },
      { value: 'SHR', label: 'الشرقية (Eastern Province)' },
      { value: 'ASR', label: 'عسير (Asir)' },
      { value: 'TBK', label: 'تبوك (Tabuk)' },
      { value: 'HAL', label: 'حائل (Hail)' },
      { value: 'SHM', label: 'الحدود الشمالية (Northern Borders)' },
      { value: 'JZN', label: 'جازان (Jazan)' },
      { value: 'NJR', label: 'نجران (Najran)' },
      { value: 'BAH', label: 'الباحة (Al Bahah)' },
      { value: 'JWF', label: 'الجوف (Al Jawf)' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'SAR 1,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Arabic (Saudi) field name mappings - bilingual for business use
 */
export const FIELD_LABELS = {
  postalCode: 'الرمز البريدي / Postal Code',
  poBox: 'صندوق البريد / PO Box',
  state: 'المنطقة / Region',
  nationalId: 'رقم الهوية الوطنية / National ID',
  iqama: 'رقم الإقامة / Iqama',
  phone: 'رقم الهاتف / Phone',
  mobile: 'رقم الجوال / Mobile',
  firstName: 'الاسم الأول / First Name',
  lastName: 'اسم العائلة / Last Name',
  fullName: 'الاسم الكامل / Full Name',
  streetAddress: 'العنوان / Address',
  city: 'المدينة / City',
  email: 'البريد الإلكتروني / Email',
  dateOfBirth: 'تاريخ الميلاد / Date of Birth',
  company: 'اسم الشركة / Company Name',
  commercialRegistration: 'السجل التجاري / Commercial Registration'
};

/**
 * Saudi PDPL (Personal Data Protection Law) compliance hints
 */
export const PDPL_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'أوافق على معالجة بياناتي الشخصية وفقاً لسياسة الخصوصية. / I consent to the processing of my personal data in accordance with the Privacy Policy.'
};
