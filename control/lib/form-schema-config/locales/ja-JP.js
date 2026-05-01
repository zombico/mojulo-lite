/**
 * Japanese (ja-JP) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'ja-JP',
  name: 'Japan',
  region: 'Asia',
  currency: 'JPY',
  dateFormat: 'YYYY/MM/DD'
};

export const PATTERNS = {
  phone: {
    pattern: '^(0\\d{1,4}-?\\d{1,4}-?\\d{4}|\\+81\\d{1,4}-?\\d{1,4}-?\\d{4})$',
    error: '有効な電話番号を入力してください',
    description: 'Japanese phone number'
  },
  postalCode: {
    pattern: '^\\d{3}-?\\d{4}$',
    error: '有効な郵便番号を入力してください（例: 123-4567）',
    description: 'Japanese postal code (〒)'
  },
  myNumber: {
    pattern: '^\\d{12}$',
    error: '有効なマイナンバーを入力してください（12桁）',
    description: 'Individual Number (My Number)'
  },
  corporateNumber: {
    pattern: '^\\d{13}$',
    error: '有効な法人番号を入力してください（13桁）',
    description: 'Corporate Number'
  },
  bankAccount: {
    pattern: '^\\d{7}$',
    error: '有効な口座番号を入力してください（7桁）',
    description: 'Japanese bank account number'
  },
  branchCode: {
    pattern: '^\\d{3}$',
    error: '有効な支店番号を入力してください（3桁）',
    description: 'Bank branch code'
  },
  currency: {
    pattern: '^¥?[\\d,]+$',
    error: '有効な金額を入力してください',
    description: 'Japanese Yen amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '03-1234-5678',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '123-4567',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 8
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '123456789012',
    pattern: PATTERNS.myNumber.pattern,
    patternError: PATTERNS.myNumber.error,
    pii: true,
    sensitive: true,
    helpText: 'マイナンバーは安全に保管されます'
  },
  prefecture: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'hokkaido', label: '北海道' },
      { value: 'aomori', label: '青森県' },
      { value: 'iwate', label: '岩手県' },
      { value: 'miyagi', label: '宮城県' },
      { value: 'akita', label: '秋田県' },
      { value: 'yamagata', label: '山形県' },
      { value: 'fukushima', label: '福島県' },
      { value: 'ibaraki', label: '茨城県' },
      { value: 'tochigi', label: '栃木県' },
      { value: 'gunma', label: '群馬県' },
      { value: 'saitama', label: '埼玉県' },
      { value: 'chiba', label: '千葉県' },
      { value: 'tokyo', label: '東京都' },
      { value: 'kanagawa', label: '神奈川県' },
      { value: 'niigata', label: '新潟県' },
      { value: 'toyama', label: '富山県' },
      { value: 'ishikawa', label: '石川県' },
      { value: 'fukui', label: '福井県' },
      { value: 'yamanashi', label: '山梨県' },
      { value: 'nagano', label: '長野県' },
      { value: 'gifu', label: '岐阜県' },
      { value: 'shizuoka', label: '静岡県' },
      { value: 'aichi', label: '愛知県' },
      { value: 'mie', label: '三重県' },
      { value: 'shiga', label: '滋賀県' },
      { value: 'kyoto', label: '京都府' },
      { value: 'osaka', label: '大阪府' },
      { value: 'hyogo', label: '兵庫県' },
      { value: 'nara', label: '奈良県' },
      { value: 'wakayama', label: '和歌山県' },
      { value: 'tottori', label: '鳥取県' },
      { value: 'shimane', label: '島根県' },
      { value: 'okayama', label: '岡山県' },
      { value: 'hiroshima', label: '広島県' },
      { value: 'yamaguchi', label: '山口県' },
      { value: 'tokushima', label: '徳島県' },
      { value: 'kagawa', label: '香川県' },
      { value: 'ehime', label: '愛媛県' },
      { value: 'kochi', label: '高知県' },
      { value: 'fukuoka', label: '福岡県' },
      { value: 'saga', label: '佐賀県' },
      { value: 'nagasaki', label: '長崎県' },
      { value: 'kumamoto', label: '熊本県' },
      { value: 'oita', label: '大分県' },
      { value: 'miyazaki', label: '宮崎県' },
      { value: 'kagoshima', label: '鹿児島県' },
      { value: 'okinawa', label: '沖縄県' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '¥10,000',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Japanese-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: '郵便番号',
  state: '都道府県',
  nationalId: 'マイナンバー',
  phone: '電話番号',
  firstName: '名',
  lastName: '姓',
  fullName: '氏名',
  streetAddress: '住所',
  city: '市区町村',
  email: 'メールアドレス',
  dateOfBirth: '生年月日',
  company: '会社名',
  department: '部署'
};

/**
 * APPI (Act on Protection of Personal Information) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: '個人情報の取り扱いについて同意します。'
};
