/**
 * Hindi - India (hi-IN) Locale Configuration
 */

export const LOCALE_INFO = {
  code: 'hi-IN',
  name: 'भारत',
  region: 'Asia',
  currency: 'INR',
  dateFormat: 'DD/MM/YYYY'
};

export const PATTERNS = {
  phone: {
    pattern: '^(\\+91[\\s-]?)?[6-9]\\d{9}$',
    error: 'कृपया एक वैध भारतीय मोबाइल नंबर दर्ज करें',
    description: 'भारतीय मोबाइल नंबर'
  },
  landline: {
    pattern: '^(\\+91[\\s-]?)?(0\\d{2,4})[\\s-]?\\d{6,8}$',
    error: 'कृपया एक वैध लैंडलाइन नंबर दर्ज करें',
    description: 'भारतीय लैंडलाइन नंबर'
  },
  postalCode: {
    pattern: '^[1-9]\\d{5}$',
    error: 'कृपया एक वैध पिन कोड दर्ज करें (6 अंक)',
    description: 'भारतीय पिन कोड'
  },
  aadhaar: {
    pattern: '^\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}$',
    error: 'कृपया एक वैध आधार नंबर दर्ज करें (12 अंक)',
    description: 'आधार विशिष्ट पहचान संख्या'
  },
  pan: {
    pattern: '^[A-Z]{5}\\d{4}[A-Z]$',
    error: 'कृपया एक वैध पैन दर्ज करें (उदा., ABCDE1234F)',
    description: 'स्थायी खाता संख्या'
  },
  gstin: {
    pattern: '^\\d{2}[A-Z]{5}\\d{4}[A-Z][A-Z\\d][Z][A-Z\\d]$',
    error: 'कृपया एक वैध जीएसटीआईएन दर्ज करें',
    description: 'जीएसटी पहचान संख्या'
  },
  voterId: {
    pattern: '^[A-Z]{3}\\d{7}$',
    error: 'कृपया एक वैध मतदाता पहचान पत्र दर्ज करें',
    description: 'मतदाता फोटो पहचान पत्र'
  },
  passport: {
    pattern: '^[A-Z]\\d{7}$',
    error: 'कृपया एक वैध पासपोर्ट नंबर दर्ज करें',
    description: 'भारतीय पासपोर्ट नंबर'
  },
  ifsc: {
    pattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
    error: 'कृपया एक वैध आईएफएससी कोड दर्ज करें',
    description: 'भारतीय वित्तीय प्रणाली कोड'
  },
  bankAccount: {
    pattern: '^\\d{9,18}$',
    error: 'कृपया एक वैध खाता संख्या दर्ज करें',
    description: 'भारतीय बैंक खाता संख्या'
  },
  upi: {
    pattern: '^[\\w\\.\\-]+@[\\w]+$',
    error: 'कृपया एक वैध यूपीआई आईडी दर्ज करें',
    description: 'यूपीआई वर्चुअल भुगतान पता'
  },
  currency: {
    pattern: '^(Rs\\.?|₹)?\\s?[\\d,]+(\\.\\d{2})?$',
    error: 'कृपया एक वैध राशि दर्ज करें',
    description: 'भारतीय रुपये में राशि'
  }
};

export const ARCHETYPES = {
  phone: {
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    placeholder: '98765 43210',
    pattern: PATTERNS.phone.pattern,
    patternError: PATTERNS.phone.error,
    pii: true
  },
  postalCode: {
    type: 'text',
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    placeholder: '110001',
    pattern: PATTERNS.postalCode.pattern,
    patternError: PATTERNS.postalCode.error,
    maxLength: 6
  },
  nationalId: {
    type: 'text',
    inputMode: 'numeric',
    placeholder: '1234 5678 9012',
    pattern: PATTERNS.aadhaar.pattern,
    patternError: PATTERNS.aadhaar.error,
    pii: true,
    sensitive: true,
    helpText: 'आपका आधार नंबर सुरक्षित रूप से संग्रहीत किया जाएगा'
  },
  pan: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'ABCDE1234F',
    pattern: PATTERNS.pan.pattern,
    patternError: PATTERNS.pan.error,
    pii: true,
    maxLength: 10
  },
  gstin: {
    type: 'text',
    inputMode: 'text',
    placeholder: '22AAAAA0000A1Z5',
    pattern: PATTERNS.gstin.pattern,
    patternError: PATTERNS.gstin.error,
    pii: true,
    maxLength: 15
  },
  ifsc: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'SBIN0001234',
    pattern: PATTERNS.ifsc.pattern,
    patternError: PATTERNS.ifsc.error,
    maxLength: 11
  },
  upi: {
    type: 'text',
    inputMode: 'text',
    placeholder: 'name@upi',
    pattern: PATTERNS.upi.pattern,
    patternError: PATTERNS.upi.error,
    pii: true
  },
  state: {
    type: 'dropdown',
    autocomplete: 'address-level1',
    options: [
      { value: 'AN', label: 'अंडमान और निकोबार द्वीपसमूह' },
      { value: 'AP', label: 'आंध्र प्रदेश' },
      { value: 'AR', label: 'अरुणाचल प्रदेश' },
      { value: 'AS', label: 'असम' },
      { value: 'BR', label: 'बिहार' },
      { value: 'CH', label: 'चंडीगढ़' },
      { value: 'CT', label: 'छत्तीसगढ़' },
      { value: 'DN', label: 'दादरा और नगर हवेली और दमन और दीव' },
      { value: 'DL', label: 'दिल्ली' },
      { value: 'GA', label: 'गोवा' },
      { value: 'GJ', label: 'गुजरात' },
      { value: 'HR', label: 'हरियाणा' },
      { value: 'HP', label: 'हिमाचल प्रदेश' },
      { value: 'JK', label: 'जम्मू और कश्मीर' },
      { value: 'JH', label: 'झारखंड' },
      { value: 'KA', label: 'कर्नाटक' },
      { value: 'KL', label: 'केरल' },
      { value: 'LA', label: 'लद्दाख' },
      { value: 'LD', label: 'लक्षद्वीप' },
      { value: 'MP', label: 'मध्य प्रदेश' },
      { value: 'MH', label: 'महाराष्ट्र' },
      { value: 'MN', label: 'मणिपुर' },
      { value: 'ML', label: 'मेघालय' },
      { value: 'MZ', label: 'मिज़ोरम' },
      { value: 'NL', label: 'नागालैंड' },
      { value: 'OR', label: 'ओडिशा' },
      { value: 'PY', label: 'पुदुचेरी' },
      { value: 'PB', label: 'पंजाब' },
      { value: 'RJ', label: 'राजस्थान' },
      { value: 'SK', label: 'सिक्किम' },
      { value: 'TN', label: 'तमिलनाडु' },
      { value: 'TG', label: 'तेलंगाना' },
      { value: 'TR', label: 'त्रिपुरा' },
      { value: 'UP', label: 'उत्तर प्रदेश' },
      { value: 'UK', label: 'उत्तराखंड' },
      { value: 'WB', label: 'पश्चिम बंगाल' }
    ]
  },
  currency: {
    type: 'text',
    inputMode: 'decimal',
    placeholder: '₹1,00,000',
    pattern: PATTERNS.currency.pattern,
    patternError: PATTERNS.currency.error
  }
};

/**
 * Hindi field name mappings
 */
export const FIELD_LABELS = {
  postalCode: 'पिन कोड',
  state: 'राज्य/केंद्र शासित प्रदेश',
  nationalId: 'आधार संख्या',
  phone: 'फ़ोन नंबर',
  mobile: 'मोबाइल नंबर',
  firstName: 'पहला नाम',
  lastName: 'अंतिम नाम',
  fullName: 'पूरा नाम',
  streetAddress: 'पता',
  city: 'शहर/कस्बा',
  district: 'जिला',
  email: 'ईमेल पता',
  dateOfBirth: 'जन्म तिथि',
  company: 'कंपनी का नाम',
  fatherName: 'पिता का नाम'
};

/**
 * DPDP Act (Digital Personal Data Protection) compliance hints
 */
export const GDPR_HINTS = {
  consentRequired: true,
  dataRetentionNotice: true,
  rightToErasure: true,
  explicitConsentLanguage: 'मैं गोपनीयता नीति के अनुसार अपने व्यक्तिगत डेटा के प्रसंस्करण के लिए सहमति देता/देती हूं।'
};
