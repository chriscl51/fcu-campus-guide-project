<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnnouncementsStore } from '../stores/announcements'
import { useBilingual } from '../utils/bilingual'
import { translateFacilityText } from '../data/facilityContentI18n'

const props = defineProps({
  building: {
    type: Object,
    required: true,
  },
})

const announcementsStore = useAnnouncementsStore()
const { locale } = useI18n({ useScope: 'global' })
const { bt, btTitle } = useBilingual()

const announcements = computed(() => announcementsStore.forBuilding(props.building.id))

// Facility location text (e.g. "各樓層南北兩側走廊底端") is transcribed
// verbatim from the source PDFs/photos in Chinese. Per user feedback these
// now also get a bilingual "zh / target" treatment via a translated-phrase
// lookup table (facilityContentI18n.js) — same AI-best-effort / non-official
// caveat as buildingNamesI18n.js, since there's no paid translation API in
// this project and these are safety-relevant location descriptions.
function btContent(zhText) {
  if (!zhText || locale.value === 'zh-TW') return zhText
  const target = translateFacilityText(zhText, locale.value)
  return target && target !== zhText ? `${zhText} / ${target}` : zhText
}

// Each entry maps a facility key (in building.facilities) to its i18n label key.
const facilitySections = computed(() => {
  if (props.building.tier !== 'full' || !props.building.facilities) return []
  const f = props.building.facilities
  return [
    { key: 'elevators', labelKey: 'facility.elevators', items: f.elevators },
    { key: 'restrooms', labelKey: 'facility.restrooms', items: f.restrooms },
    { key: 'water', labelKey: 'facility.water', items: f.water },
    { key: 'aed', labelKey: 'facility.aed', items: f.aed },
    { key: 'rest', labelKey: 'facility.restArea', items: f.rest },
  ].filter((section) => Array.isArray(section.items) && section.items.length > 0)
})
</script>

<template>
  <div class="facility-panel">
    <div class="facility-header">
      <h2>{{ btTitle('facility.title', building) }}</h2>
      <span class="pill" :class="building.tier === 'full' ? 'tier-full' : 'tier-partial'">
        {{ building.tier === 'full' ? bt('facility.tierFull') : bt('facility.tierPartial') }}
      </span>
    </div>

    <section v-if="building.roomCode" class="facility-section">
      <h3>{{ bt('facility.roomCodeExample') }}</h3>
      <p>{{ bt('facility.roomCodeHint', { code: building.roomCode }) }}</p>
    </section>

    <template v-if="building.tier === 'full'">
      <section
        v-for="section in facilitySections"
        :key="section.key"
        class="facility-section"
      >
        <h3>{{ bt(section.labelKey) }}</h3>
        <ul>
          <li v-for="(item, idx) in section.items" :key="idx">{{ btContent(item) }}</li>
        </ul>
        <p v-if="section.key === 'restrooms'" class="muted-note">
          {{ bt('facility.accessibleNote') }}
        </p>
      </section>
    </template>

    <section v-else class="facility-section pending">
      <p>{{ bt('facility.dataPending') }}</p>
    </section>

    <section v-if="announcements.length" class="announcements-section">
      <h3>{{ bt('facility.announcementsTitle') }}</h3>
      <div v-for="a in announcements" :key="a.id" class="announcement-card">
        <div class="announcement-head">
          <span class="tag">{{ bt(`announcementType.${a.type}`) }}</span>
          <span v-if="a.area" class="announcement-area">{{ a.area }}</span>
        </div>
        <p class="announcement-message">
          {{ a.message?.[locale] || a.message?.en || a.message?.['zh-TW'] || a.message }}
        </p>
        <p
          v-if="a.message && typeof a.message === 'object' && !a.message[locale] && locale !== 'en'"
          class="muted-note"
        >
          {{ bt('facility.announcementFallbackNote') }}
        </p>
        <p v-if="a.startDate || a.endDate" class="announcement-dates">
          {{ a.startDate }}<span v-if="a.startDate && a.endDate"> – </span>{{ a.endDate }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.facility-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.facility-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.facility-header h2 {
  margin: 0;
  flex: 1 1 auto;
  font-size: 1.4rem;
  line-height: 1.4;
}

.facility-section {
  padding-bottom: 0.25rem;
}
.facility-section + .facility-section {
  border-top: 1px solid var(--border);
  padding-top: 1.1rem;
}

.facility-section h3 {
  margin: 0 0 0.6rem;
  font-size: 1.2rem;
  color: var(--fcu-blue-dark);
}
.facility-section ul {
  margin: 0;
  padding-left: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.facility-section li {
  font-size: 1.05rem;
  line-height: 1.6;
}
.facility-section.pending p {
  color: var(--text-muted);
  font-size: 1.05rem;
}

.muted-note {
  margin: 0.5rem 0 0;
  font-size: 0.92rem;
  color: var(--text-muted);
}

.announcements-section h3 {
  margin: 0 0 0.6rem;
  color: var(--fcu-maroon-dark);
}

.announcement-card {
  border: 1.5px solid var(--fcu-maroon-light);
  background: rgba(129, 27, 41, 0.06);
  border-radius: 10px;
  padding: 0.85rem 1rem;
  margin-bottom: 0.6rem;
}
.announcement-card:last-child {
  margin-bottom: 0;
}

.announcement-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.2em 0.7em;
  border-radius: 999px;
  background: var(--fcu-maroon);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}

.announcement-area {
  font-weight: 600;
  color: var(--text);
}

.announcement-message {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.55;
}

.announcement-dates {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .facility-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
