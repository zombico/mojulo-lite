// Mojulo-Lite i18n config.
//
// `locales` lists which locales are actually shipped — only codes that have a
// matching messages/<code>.json file should be in here. The translate-messages
// skill keeps this in sync with the messages/ directory.
//
// `localeNames` is pre-populated with display names for every locale we
// realistically expect to translate to, so adding a locale only requires
// pushing the code into `locales`. Names are written in the language itself
// (autonym) so a user who doesn't read English can still find their language.
export const locales = ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'uk', 'zh'];
export const defaultLocale = 'en';

export const localeNames = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  'pt-BR': 'Português (Brasil)',
  nl: 'Nederlands',
  sv: 'Svenska',
  da: 'Dansk',
  no: 'Norsk',
  fi: 'Suomi',
  pl: 'Polski',
  cs: 'Čeština',
  hu: 'Magyar',
  ro: 'Română',
  el: 'Ελληνικά',
  bg: 'Български',
  uk: 'Українська',
  ru: 'Русский',
  tr: 'Türkçe',
  ja: '日本語',
  ko: '한국어',
  zh: '中文（简体）',
  'zh-TW': '中文（繁體）',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
  hi: 'हिन्दी',
  ar: 'العربية',
  he: 'עברית',
  fa: 'فارسی',
  ur: 'اردو',
};

// Right-to-left scripts. Used by app/layout.js to set <html dir="rtl">.
export const rtlLocales = new Set(['ar', 'he', 'fa', 'ur']);
