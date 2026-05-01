/**
 * Simplified Chinese - China (zh-CN) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'zh-CN',
  name: 'China',
  region: 'Asia',
  currency: 'CNY',
  dateFormat: 'YYYY-MM-DD'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
    error: '请输入有效的手机号码',
    description: 'Chinese mobile number'
  },
  landline: {
    pattern: '^(\\+86)?(0\\d{2,3})-?\\d{7,8}$',
    error: '请输入有效的固定电话',
    description: 'Chinese landline number'
  },
  postalCode: {
    pattern: '^\\d{6}$',
    error: '请输入有效的邮政编码（6位数字）',
    description: 'Chinese postal code'
  },
  idCard: {
    pattern: '^[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]$',
    error: '请输入有效的身份证号码',
    description: 'Resident Identity Card (18 digits)'
  },
  usci: {
    pattern: '^[0-9A-HJ-NPQRTUWXY]{2}\\d{6}[0-9A-HJ-NPQRTUWXY]{10}$',
    error: '请输入有效的统一社会信用代码',
    description: 'Unified Social Credit Identifier'
  },
  bankCard: {
    pattern: '^\\d{16,19}$',
    error: '请输入有效的银行卡号',
    description: 'Chinese bank card number'
  },
  passport: {
    pattern: '^[EeGg]\\d{8}$',
    error: '请输入有效的护照号码',
    description: 'Chinese passport number'
  },
  currency: {
    pattern: '^¥?[\\d,]+(\\.\\d{2})?$',
    error: '请输入有效的金额',
    description: 'Chinese Yuan amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '13812345678',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '100000',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 6
  },
  nationalId: {
    type: 'text',
    inputMode: 'text',
    placeholder: '110101199001011234',
    pattern: PATTERNS.idCard.pattern,
    patternError: PATTERNS.idCard.error,
    pii: true,
    sensitive: true,
    helpText: '您的身份证号码将被安全存储',
    maxLength: 18
  },
  usci: {
    type: 'text',
    inputMode: 'text',
    placeholder: '91110000MA001ABCX0',
    pattern: PATTERNS.usci.pattern,
    patternError: PATTERNS.usci.error,
    pii: true,
    maxLength: 18
  },
  province: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'beijing', label: '北京市' },
      { value: 'tianjin', label: '天津市' },
      { value: 'hebei', label: '河北省' },
      { value: 'shanxi', label: '山西省' },
      { value: 'neimenggu', label: '内蒙古自治区' },
      { value: 'liaoning', label: '辽宁省' },
      { value: 'jilin', label: '吉林省' },
      { value: 'heilongjiang', label: '黑龙江省' },
      { value: 'shanghai', label: '上海市' },
      { value: 'jiangsu', label: '江苏省' },
      { value: 'zhejiang', label: '浙江省' },
      { value: 'anhui', label: '安徽省' },
      { value: 'fujian', label: '福建省' },
      { value: 'jiangxi', label: '江西省' },
      { value: 'shandong', label: '山东省' },
      { value: 'henan', label: '河南省' },
      { value: 'hubei', label: '湖北省' },
      { value: 'hunan', label: '湖南省' },
      { value: 'guangdong', label: '广东省' },
      { value: 'guangxi', label: '广西壮族自治区' },
      { value: 'hainan', label: '海南省' },
      { value: 'chongqing', label: '重庆市' },
      { value: 'sichuan', label: '四川省' },
      { value: 'guizhou', label: '贵州省' },
      { value: 'yunnan', label: '云南省' },
      { value: 'xizang', label: '西藏自治区' },
      { value: 'shaanxi', label: '陕西省' },
      { value: 'gansu', label: '甘肃省' },
      { value: 'qinghai', label: '青海省' },
      { value: 'ningxia', label: '宁夏回族自治区' },
      { value: 'xinjiang', label: '新疆维吾尔自治区' },
      { value: 'hongkong', label: '香港特别行政区' },
      { value: 'macau', label: '澳门特别行政区' },
      { value: 'taiwan', label: '台湾省' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '¥100.00',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Simplified Chinese field name mappings
 */
export const FIELD_LABELS = {
  postalCode: '邮政编码',
  state: '省/自治区/直辖市',
  nationalId: '身份证号码',
  phone: '电话号码',
  mobile: '手机号码',
  firstName: '名',
  lastName: '姓',
  fullName: '姓名',
  streetAddress: '详细地址',
  city: '市/区',
  district: '区/县',
  email: '电子邮箱',
  dateOfBirth: '出生日期',
  company: '公司名称'
};

/**
 * PIPL (Personal Information Protection Law) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: '我同意按照隐私政策处理我的个人信息。'
};
