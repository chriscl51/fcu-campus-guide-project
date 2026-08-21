<script setup>
// Origin/destination picker (spec: "使用者從下拉選單選擇自己的出發地點...和目的地").
import { computed, onMounted, ref } from 'vue'
import { useAppStore, DRIVE_MODE_ORIGIN } from '../stores/app'
import { useBilingual } from '../utils/bilingual'
import { fetchEventLocations } from '../utils/api'
import buildings from '../data/buildings.json'
import gates from '../data/gates.json'
import { selectableBuildings } from '../utils/buildingOptions'

const store = useAppStore()
const { btName, bt, locale } = useBilingual()

const emit = defineEmits(['submit'])

// Feature: quick-pick a destination from campus activities/events happening
// soon (powered by the optional Node.js + SQLite backend — see utils/api.js
// and README's 「活動公告後端」section). Empty list if the backend isn't
// running; the rest of the form works exactly as before either way.
const eventLocations = ref([])
onMounted(async () => {
  const locations = await fetchEventLocations()
  if (locations) eventLocations.value = locations
})
function onEventLocationChange(e) {
  const buildingId = e.target.value
  if (!buildingId) return
  store.setDestination(buildingId)
  e.target.value = '' // reset the quick-pick control itself; destination select above reflects the choice
}

const sortedBuildings = computed(() => selectableBuildings(buildings))

// Feedback item: dropdown options get the same building code shown on the
// redesigned map (e.g. "LIB｜圖書館 / Library") so the two views match up.
// Name half follows the sitewide zh-TW/target-language bilingual rule.
function buildingLabel(b) {
  const namePart = btName(b)
  return b.officialCode ? `${b.officialCode}｜${namePart}` : namePart
}

const canSubmit = computed(() => Boolean(store.originId) && Boolean(store.destinationId))

function onOriginChange(e) {
  store.setOrigin(e.target.value || null)
}

function onDestinationChange(e) {
  store.setDestination(e.target.value || null)
}

function onSubmit() {
  if (!canSubmit.value) return
  emit('submit')
}
</script>

<template>
  <div class="select-form screen">
    <div class="card select-card">
      <h2>{{ $t('select.heading') }}</h2>

      <div class="field">
        <label for="origin-select">{{ $t('select.originLabel') }}</label>
        <select id="origin-select" :value="store.originId ?? ''" @change="onOriginChange">
          <option value="" disabled>{{ $t('select.originPlaceholder') }}</option>
          <option :value="DRIVE_MODE_ORIGIN">{{ $t('select.driveOption') }}</option>
          <optgroup :label="bt('select.gatesGroup')">
            <option v-for="g in gates" :key="g.id" :value="g.id">{{ buildingLabel(g) }}</option>
          </optgroup>
          <optgroup :label="bt('select.buildingsGroup')">
            <option v-for="b in sortedBuildings" :key="b.id" :value="b.id">
              {{ buildingLabel(b) }}
            </option>
          </optgroup>
        </select>
      </div>

      <div class="field">
        <label for="destination-select">{{ $t('select.destinationLabel') }}</label>
        <select id="destination-select" :value="store.destinationId ?? ''" @change="onDestinationChange">
          <option value="" disabled>{{ $t('select.destinationPlaceholder') }}</option>
          <option v-for="b in sortedBuildings" :key="b.id" :value="b.id">
            {{ buildingLabel(b) }}
          </option>
        </select>
      </div>

      <div v-if="eventLocations.length" class="field event-quickpick">
        <label for="event-location-select">{{ $t('select.eventLocationLabel') }}</label>
        <select id="event-location-select" value="" @change="onEventLocationChange">
          <option value="">{{ $t('select.eventLocationPlaceholder') }}</option>
          <option v-for="loc in eventLocations" :key="loc.building_id" :value="loc.building_id">
            {{ loc.official_code ? `${loc.official_code}｜` : '' }}{{ locale === 'zh-TW' || !loc.name_en ? loc.name_zh : `${loc.name_zh} / ${loc.name_en}` }}
          </option>
        </select>
      </div>

      <button type="button" class="btn select-submit-btn" :disabled="!canSubmit" @click="onSubmit">
        {{ $t('select.startButton') }}
      </button>
      <p v-if="!canSubmit" class="select-hint">{{ $t('select.missingSelection') }}</p>
    </div>
  </div>
</template>

<style scoped>
.select-form {
  justify-content: center;
}

.select-card {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  width: 100%;
  max-width: 480px;
}

.select-submit-btn {
  width: 100%;
  margin-top: 0.25rem;
}

.select-hint {
  margin: -0.5rem 0 0;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .select-card {
    padding: 1rem;
  }
}
</style>
