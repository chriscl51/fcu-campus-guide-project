<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnnouncementsStore } from '../stores/announcements'
import { useBilingual } from '../utils/bilingual'
import { translateFacilityText } from '../data/facilityContentI18n'
import { formatWallClock } from '../utils/dateFormat'
import { fetchUpcomingEvents } from '../utils/api'
import BilingualText from './BilingualText.vue'

const props = defineProps({
  building: {
    type: Object,
    required: true,
  },
})

const announcementsStore = useAnnouncementsStore()
const { locale } = useI18n({ useScope: 'global' })
const { bt, btPair, btTitlePair } = useBilingual()

const announcements = computed(() => announcementsStore.activeForBuilding(props.building.id))

// Feature: the building's currently-relevant activities/events (學測、演講…)
// now show here too, not just on the landing page board — a visitor who
// navigated straight to this building's info (e.g. from a bookmark or the
// dropdown) should still see "this building hosts an exam this week" without
// having to go back to the homepage. `fetchUpcomingEvents()` is fetched once;
// the building prop can change without remounting this component (GuideView
// reuses one FacilityPanel instance), so the filter below stays reactive.
const upcomingEvents = ref([])
onMounted(async () => {
  const events = await fetchUpcomingEvents()
  if (events) upcomingEvents.value = events
})
const buildingEvents = computed(() =>
  upcomingEvents.value.filter((e) => (e.locations || []).some((loc) => loc.buildingId === props.building.id))
)
function eventDateRange(e) {
  const start = formatWallClock(e.start_date, locale.value)
  const end = formatWallClock(e.end_date, locale.value)
  return e.start_date === e.end_date ? start : `${start} – ${end}`
}

// building.photo is a root-relative path into public/buildings/ (e.g.
// "buildings/library.jpg") — same mechanism/asset set as ArrivalModal.vue.
// This is the main "設施資訊欄" info panel (shown as soon as a destination is
// picked, not just on arrival), so the photo needs to live here too.
function photoUrl(path) {
  return `${import.meta.env.BASE_URL}${path}`
}

// Facility location text (e.g. "各樓層南北兩側走廊底端") is transcribed
// verbatim from the source PDFs/photos in Chinese. Per user feedback these
// now also get a bilingual zh/target treatment, laid out as parallel blocks
// via BilingualText.vue, using a translated-phrase lookup table
// (facilityContentI18n.js) — same AI-best-effort / non-official caveat as
// buildingNamesI18n.js, since there's no paid translation API in this
// project and these are safety-relevant location descriptions.
function btContentPair(zhText) {
  if (!zhText || locale.value === 'zh-TW') return { zh: zhText, target: '' }
  const target = translateFacilityText(zhText, locale.value)
  return { zh: zhText, target: target && target !== zhText ? target : '' }
}

// Each entry maps a facility key (in building.facilities) to its i18n label key.
const facilitySections = computed(() => {
  if (props.building.tier !== 'full' || !props.building.facilities) return []
  const f = props.building.facilities
  return [
    { key: 'aed', labelKey: 'facility.aed', items: f.aed },
    { key: 'elevators', labelKey: 'facility.elevators', items: f.elevators },
    { key: 'accessibleElevators', labelKey: 'facility.accessibleElevators', items: f.accessibleElevators },
    { key: 'restrooms', labelKey: 'facility.restrooms', items: f.restrooms },
    { key: 'accessibleRestrooms', labelKey: 'facility.accessibleRestrooms', items: f.accessibleRestrooms },
    { key: 'water', labelKey: 'facility.water', items: f.water },
    { key: 'rest', labelKey: 'facility.nearbyRestArea', items: f.rest },
    { key: 'floors', labelKey: 'facility.floors', items: f.floors },
  ].filter((section) => Array.isArray(section.items) && section.items.length > 0)
})
</script>

<template>
  <div class="facility-panel">
    <div class="facility-header">
      <h2><BilingualText v-bind="btTitlePair('facility.title', building)" /></h2>
      <span class="pill" :class="building.tier === 'full' ? 'tier-full' : 'tier-partial'">
        <BilingualText v-bind="btPair(building.tier === 'full' ? 'facility.tierFull' : 'facility.tierPartial')" />
      </span>
    </div>

    <div class="facility-photo-wrap">
      <img
        v-if="building.photo"
        :src="photoUrl(building.photo)"
        :alt="building.nameZh"
        class="facility-photo"
      />
      <div v-else class="facility-photo-placeholder">
        <span>{{ $t('arrival.photoMissing') }}</span>
      </div>
    </div>

    <section v-if="building.accessNote" class="facility-section">
      <h3><BilingualText v-bind="btPair('facility.accessNote')" /></h3>
      <p><BilingualText v-bind="btContentPair(building.accessNote)" /></p>
    </section>

    <section v-if="building.roomCode" class="facility-section">
      <h3><BilingualText v-bind="btPair('facility.roomCodeExample')" /></h3>
      <p><BilingualText v-bind="btPair('facility.roomCodeHint', { code: building.roomCode })" /></p>
    </section>

    <template v-if="building.tier === 'full'">
      <section
        v-for="section in facilitySections"
        :key="section.key"
        class="facility-section"
        :class="{ 'aed-section': section.key === 'aed' }"
      >
        <h3><BilingualText v-bind="btPair(section.labelKey)" /></h3>
        <ul>
          <li v-for="(item, idx) in section.items" :key="idx"><BilingualText v-bind="btContentPair(item)" /></li>
        </ul>
        <p
          v-if="section.key === 'restrooms' && !building.facilities.accessibleRestrooms?.length"
          class="muted-note"
        >
          <BilingualText v-bind="btPair('facility.accessibleNote')" />
        </p>
      </section>
    </template>

    <section v-else class="facility-section pending">
      <p><BilingualText v-bind="btPair('facility.dataPending')" /></p>
    </section>

    <section v-if="buildingEvents.length" class="announcements-section events-section">
      <h3>{{ bt('events.upcomingTitle') }}</h3>
      <div v-for="e in buildingEvents" :key="e.id" class="announcement-card">
        <div class="announcement-head">
          <span class="tag"><BilingualText v-bind="btPair(`eventType.${e.type}`)" /></span>
          <span class="announcement-area">{{ e.title }}</span>
        </div>
        <p v-if="e.description" class="announcement-message">{{ e.description }}</p>
        <p class="announcement-dates">{{ eventDateRange(e) }}</p>
      </div>
    </section>

    <section v-if="announcements.length" class="announcements-section">
      <h3><BilingualText v-bind="btPair('facility.announcementsTitle')" /></h3>
      <div v-for="a in announcements" :key="a.id" class="announcement-card">
        <div class="announcement-head">
          <span class="tag"><BilingualText v-bind="btPair(`announcementType.${a.type}`)" /></span>
          <span v-if="a.area" class="announcement-area">{{ a.area }}</span>
        </div>
        <p class="announcement-message">
          {{ a.message?.[locale] || a.message?.en || a.message?.['zh-TW'] || a.message }}
        </p>
        <p
          v-if="a.message && typeof a.message === 'object' && !a.message[locale] && locale !== 'en'"
          class="muted-note"
        >
          <BilingualText v-bind="btPair('facility.announcementFallbackNote')" />
        </p>
        <p v-if="a.startDate || a.endDate" class="announcement-dates">
          {{ formatWallClock(a.startDate, locale) }}<span v-if="a.startDate && a.endDate"> – </span>{{ formatWallClock(a.endDate, locale) }}
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

.facility-photo-wrap {
  margin: -0.25rem 0 0.25rem;
}
.facility-photo {
  width: 100%;
  height: 240px;
  object-fit: contain;
  background: var(--bg);
  border-radius: 10px;
  display: block;
}
.facility-photo-placeholder {
  width: 100%;
  min-height: 120px;
  border: 2px dashed var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  padding: 1rem;
  text-align: center;
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
.aed-section h3,
.aed-section li {
  color: #c0392b;
  font-weight: 700;
}
.aed-section h3 {
  font-size: 1.35rem;
}
.aed-section li {
  font-size: 1.2rem;
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
.events-section h3 {
  color: var(--fcu-blue-dark);
}

.announcement-card {
  border: 1.5px solid var(--fcu-maroon-light);
  background: rgba(129, 27, 41, 0.06);
  border-radius: 10px;
  padding: 0.85rem 1rem;
  margin-bottom: 0.6rem;
}
.events-section .announcement-card {
  border-color: var(--fcu-blue-light, var(--fcu-blue-dark));
  background: rgba(0, 107, 147, 0.06);
}
.events-section .tag {
  background: var(--fcu-blue-dark);
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
