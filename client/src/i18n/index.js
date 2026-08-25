import { createI18n } from 'vue-i18n'
import zhTW from './locales/zh-TW.js'
import en from './locales/en.js'
import ja from './locales/ja.js'
import ko from './locales/ko.js'
import vi from './locales/vi.js'
import id from './locales/id.js'
import th from './locales/th.js'

export const SUPPORTED_LOCALES = ['zh-TW', 'en', 'ja', 'ko', 'vi', 'id', 'th']

export const LOCALE_LABELS = {
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  th: 'ไทย',
}

const STORAGE_KEY = 'fcu-guide-locale'

/**
 * Detect the visitor's device language and map it onto one of our 7
 * supported locales. Falls back to English when the device language isn't
 * one we support (spec item 7: "若不在上述語系內則自動顯示英文").
 */
export function detectLocale() {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && SUPPORTED_LOCALES.includes(saved)) return saved
    } catch {
      // ignore
    }
  }

  if (typeof navigator === 'undefined') return 'zh-TW'

  const candidates = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'en']

  for (const raw of candidates) {
    const lower = raw.toLowerCase()
    if (lower.startsWith('zh')) {
      // Traditional-leaning tags (zh-TW/zh-HK/zh-Hant/bare zh) -> zh-TW.
      // Simplified-leaning tags (zh-CN/zh-Hans/zh-SG) fall through to the
      // "not one of our supported variants" case below -> English, per the
      // project rule that Simplified Chinese is never produced automatically.
      if (lower.includes('cn') || lower.includes('hans') || lower.includes('sg')) break
      return 'zh-TW'
    }
    if (lower.startsWith('en')) return 'en'
    if (lower.startsWith('ja')) return 'ja'
    if (lower.startsWith('ko')) return 'ko'
    if (lower.startsWith('vi')) return 'vi'
    if (lower.startsWith('id') || lower.startsWith('in')) return 'id' // "in" = old ISO code for Indonesian
    if (lower.startsWith('th')) return 'th'
  }
  return 'en'
}

export function persistLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore — locale just won't be remembered across visits
  }
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { 'zh-TW': zhTW, en, ja, ko, vi, id, th },
})

export default i18n
