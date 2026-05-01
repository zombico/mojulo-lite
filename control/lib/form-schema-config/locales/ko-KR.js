/**
 * Korean (ko-KR) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'ko-KR',
  name: 'South Korea',
  region: 'Asia',
  currency: 'KRW',
  dateFormat: 'YYYY.MM.DD'
};

export const PATTERNS = {
  phone: {
    pattern: '^(0\\d{1,2}-?\\d{3,4}-?\\d{4}|\\+82-?\\d{1,2}-?\\d{3,4}-?\\d{4})$',
    error: '전화번호를 확인해 주세요',
    description: 'Korean phone number'
  },
  mobile: {
    pattern: '^(010-?\\d{4}-?\\d{4}|\\+82-?10-?\\d{4}-?\\d{4})$',
    error: '휴대폰 번호를 확인해 주세요',
    description: 'Korean mobile number'
  },
  postalCode: {
    pattern: '^\\d{5}$',
    error: '우편번호 5자리를 확인해 주세요',
    description: 'Korean postal code'
  },
  residentRegistration: {
    pattern: '^\\d{6}-?\\d{7}$',
    error: '주민등록번호를 확인해 주세요',
    description: 'Resident Registration Number'
  },
  businessRegistration: {
    pattern: '^\\d{3}-?\\d{2}-?\\d{5}$',
    error: '사업자등록번호를 확인해 주세요',
    description: 'Business Registration Number'
  },
  bankAccount: {
    pattern: '^\\d{10,14}$',
    error: '계좌번호를 확인해 주세요',
    description: 'Korean bank account number'
  },
  currency: {
    pattern: '^₩?[\\d,]+원?$',
    error: '금액을 확인해 주세요',
    description: 'Korean Won amount'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '010-1234-5678',
    pattern: PATTERNS.mobile.pattern,
    patternError: PATTERNS.mobile.error,
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
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '123456-1234567',
    pattern: PATTERNS.residentRegistration.pattern,
    patternError: PATTERNS.residentRegistration.error,
    pii: true,
    sensitive: true,
    helpText: '주민등록번호는 암호화되어 안전하게 보관됩니다'
  },
  province: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'seoul', label: '서울특별시' },
      { value: 'busan', label: '부산광역시' },
      { value: 'daegu', label: '대구광역시' },
      { value: 'incheon', label: '인천광역시' },
      { value: 'gwangju', label: '광주광역시' },
      { value: 'daejeon', label: '대전광역시' },
      { value: 'ulsan', label: '울산광역시' },
      { value: 'sejong', label: '세종특별자치시' },
      { value: 'gyeonggi', label: '경기도' },
      { value: 'gangwon', label: '강원도' },
      { value: 'chungbuk', label: '충청북도' },
      { value: 'chungnam', label: '충청남도' },
      { value: 'jeonbuk', label: '전라북도' },
      { value: 'jeonnam', label: '전라남도' },
      { value: 'gyeongbuk', label: '경상북도' },
      { value: 'gyeongnam', label: '경상남도' },
      { value: 'jeju', label: '제주특별자치도' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '₩10,000',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Korean-specific field name mappings
 */
export const FIELD_LABELS = {
  postalCode: '우편번호',
  state: '시·도',
  nationalId: '주민등록번호',
  phone: '전화번호',
  mobile: '휴대폰 번호',
  firstName: '이름',  // Given name (이름) - comes second in Korean name order
  lastName: '성',     // Family name (성) - comes first in Korean name order
  fullName: '성명',
  streetAddress: '도로명주소',
  city: '시·군·구',
  email: '이메일',
  dateOfBirth: '생년월일',
  company: '회사명',
  department: '부서'
};

/**
 * PIPA (Personal Information Protection Act / 개인정보보호법) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: '개인정보 수집 및 이용에 동의합니다.'
};
