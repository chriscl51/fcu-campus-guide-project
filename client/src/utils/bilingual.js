// Sitewide "中文 / 目標語言" bilingual display rule (feedback item 5): when the
// visitor's UI language isn't zh-TW, dropdown option labels and building
// facility info show "zh-TW text / target-language text" side by side, so
// the Chinese half can be visually matched against the real campus signage
// (which is Chinese + English only). Locale === zh-TW shows just the
// Chinese text, no duplication. Locale === en shows "zh-TW / English".
import { useI18n } from 'vue-i18n'
import { BUILDING_NAMES_I18N, GATE_NAMES_I18N } from '../data/buildingNamesI18n'

export function useBilingual() {
  const { locale, t } = useI18n({ useScope: 'global' })

  /** Bilingual pair for an i18n message key: "zh-TW string / target string". */
  function bt(key, params = {}) {
    const zh = t(key, params, { locale: 'zh-TW' })
    if (locale.value === 'zh-TW') return zh
    const target = t(key, params, { locale: locale.value })
    return target && target !== zh ? `${zh} / ${target}` : zh
  }

  /** This locale's translation of a building/gate name, or English if this
   * locale has no dedicated entry in buildingNamesI18n.js. Single-language —
   * does NOT include the zh-TW half (see btName for the display pair). */
  function targetNameFor(entity) {
    if (!entity) return ''
    if (locale.value === 'en') return entity.nameEn || entity.nameZh
    const table = String(entity.id).startsWith('gate-') ? GATE_NAMES_I18N : BUILDING_NAMES_I18N
    return table[entity.id]?.[locale.value] || entity.nameEn || entity.nameZh
  }

  /**
   * Bilingual pair for a building/gate's display name. `entity` needs
   * `id`, `nameZh`, `nameEn`. Falls back to English when this locale has no
   * dedicated translation in buildingNamesI18n.js (per the project's
   * established "missing translation -> English" fallback rule).
   */
  function btName(entity) {
    if (!entity) return ''
    if (locale.value === 'zh-TW') return entity.nameZh
    const target = targetNameFor(entity)
    return target && target !== entity.nameZh ? `${entity.nameZh} / ${target}` : entity.nameZh
  }

  /**
   * Bilingual pair for an i18n message key that interpolates a building/gate
   * name (e.g. facility.title = "{name} 設施資訊"). Building the whole
   * templated string once per language and THEN pairing them — as opposed to
   * pre-pairing the name and feeding it into bt(), which double-duplicates
   * ("圖書館 / Library 設施資訊 / 圖書館 / Library Facility Information").
   */
  function btTitle(key, entity) {
    const zh = t(key, { name: entity?.nameZh ?? '' }, { locale: 'zh-TW' })
    if (locale.value === 'zh-TW') return zh
    const target = t(key, { name: targetNameFor(entity) }, { locale: locale.value })
    return target && target !== zh ? `${zh} / ${target}` : zh
  }

  return { bt, btName, btTitle, locale, targetNameFor }
}
