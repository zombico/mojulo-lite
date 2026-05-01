/**
 * Traditional Chinese - Hong Kong (zh-HK) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'zh-HK',
  name: 'Hong Kong',
  region: 'Asia',
  currency: 'HKD',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+852[\\s-]?)?[2-9]\\d{7}$',
    error: '請輸入有效的電話號碼',
    description: 'Hong Kong phone number'
  },
  mobile: {
    pattern: '^(\\+852[\\s-]?)?[5-9]\\d{7}$',
    error: '請輸入有效的手機號碼',
    description: 'Hong Kong mobile number'
  },
  hkid: {
    pattern: '^[A-Z]{1,2}\\d{6}\\(?[0-9A]\\)?$',
    error: '請輸入有效的香港身份證號碼',
    description: 'Hong Kong Identity Card'
  },
  brn: {
    pattern: '^\\d{8}$',
    error: '請輸入有效的商業登記號碼',
    description: 'Business Registration Number'
  },
  bankAccount: {
    pattern: '^\\d{3}-?\\d{6}-?\\d{3}$',
    error: '請輸入有效的銀行帳戶號碼',
    description: 'Hong Kong bank account'
  },
  fps: {
    pattern: '^\\d{7,9}$',
    error: '請輸入有效的轉數快識別碼',
    description: 'Faster Payment System ID'
  },
  currency: {
    pattern: '^(HK\\$|\\$)?[\\d,]+(\\.\\d{2})?$',
    error: '請輸入有效的金額',
    description: 'Hong Kong Dollar amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '9123 4567',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'text',
    placeholder: 'N/A',
    helpText: '香港不使用郵政編碼'
  },
  nationalId: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'A123456(7)',
    pattern: PATTERNS.hkid.pattern,
    patternError: PATTERNS.hkid.error,
    pii: true,
    sensitive: true,
    helpText: '您的身份證號碼將被安全儲存'
  },
  district: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'central-western', label: '中西區' },
      { value: 'eastern', label: '東區' },
      { value: 'southern', label: '南區' },
      { value: 'wan-chai', label: '灣仔區' },
      { value: 'kowloon-city', label: '九龍城區' },
      { value: 'kwun-tong', label: '觀塘區' },
      { value: 'sham-shui-po', label: '深水埗區' },
      { value: 'wong-tai-sin', label: '黃大仙區' },
      { value: 'yau-tsim-mong', label: '油尖旺區' },
      { value: 'islands', label: '離島區' },
      { value: 'kwai-tsing', label: '葵青區' },
      { value: 'north', label: '北區' },
      { value: 'sai-kung', label: '西貢區' },
      { value: 'sha-tin', label: '沙田區' },
      { value: 'tai-po', label: '大埔區' },
      { value: 'tsuen-wan', label: '荃灣區' },
      { value: 'tuen-mun', label: '屯門區' },
      { value: 'yuen-long', label: '元朗區' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'HK$1,000.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Traditional Chinese (HK) field name mappings
 */
export const FIELD_LABELS = {
  postalCode: '郵政編碼',
  state: '地區',
  district: '區域',
  nationalId: '香港身份證號碼',
  phone: '電話號碼',
  mobile: '手機號碼',
  firstName: '名',
  lastName: '姓',
  fullName: '姓名',
  streetAddress: '地址',
  city: '城市',
  building: '大廈/屋苑',
  floor: '樓層',
  flat: '單位',
  email: '電郵地址',
  dateOfBirth: '出生日期',
  company: '公司名稱'
};

/**
 * PDPO (Personal Data Privacy Ordinance) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: '本人同意按照私隱政策處理本人的個人資料。'
};
