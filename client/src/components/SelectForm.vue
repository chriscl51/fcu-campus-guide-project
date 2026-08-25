<script setup>
// Origin/destination picker with quick destination chips & auto-filled destination banner.
import { computed, onMounted, ref } from 'vue'
import { useAppStore, DRIVE_MODE_ORIGIN } from '../stores/app'
import { useBilingual } from '../utils/bilingual'
import { fetchEventLocations } from '../utils/api'
import { selectableBuildings, getPopularBuildings } from '../utils/buildingOptions'
import buildings from '../data/buildings.json'
import gates from '../data/gates.json'

const store = useAppStore()
const { btName, bt, locale } = useBilingual()

const emit = defineEmits(['submit'])

// Event locations from backend API
const eventLocations = ref([])
onMounted(async () => {
  const locations = await fetchEventLocations()
  if (locations) eventLocations.value = locations
})

function onEventLocationChange(e) {
  const buildingId = e.target.value
  if (!buildingId) return
  store.setDestination(buildingId)
  e.target.value = ''
}

// Popular destination shortcuts & sorted buildings
const popularDestBuildings = computed(() => getPopularBuildings(buildings))
const sortedBuildings = computed(() => selectableBuildings(buildings))

// Quick origin options (Gates + Drive option)
const quickOriginOptions = computed(() => [
  { id: 'gate-west', label: btName(gates.find((g) => g.id === 'gate-west')) || '西門（大門口）' },
  { id: 'gate-north', label: btName(gates.find((g) => g.id === 'gate-north')) || '北門' },
  { id: 'gate-east', label: btName(gates.find((g) => g.id === 'gate-east')) || '東門' },
  { id: DRIVE_MODE_ORIGIN, label: `🚗 ${bt('select.driveOption')}` },
])

function buildingLabel(b) {
  const namePart = btName(b)
  return b.officialCode ? `${b.officialCode}｜${namePart}` : namePart
}

const currentDestination = computed(() => {
  if (!store.destinationId) return null
  return buildings.find((b) => b.id === store.destinationId) || gates.find((g) => g.id === store.destinationId)
})

const canSubmit = computed(() => Boolean(store.originId) && Boolean(store.destinationId))

function onOriginChange(e) {
  store.setOrigin(e.target.value || null)
}

function onDestinationChange(e) {
  store.setDestination(e.target.value || null)
}

function setQuickOrigin(originId) {
  store.setOrigin(originId)
}

function setQuickDest(destId) {
  store.setDestination(destId)
}

function onBack() {
  store.reset()
}

function onSubmit() {
  if (!canSubmit.value) return
  emit('submit')
}
</script>

<template>
  <div class="select-form screen">
    <div class="card select-card">
      <div class="select-top-nav">
        <button type="button" class="back-link-btn" @click="onBack">
          ← {{ $t('common.back') }}
        </button>
      </div>

      <h2>{{ $t('select.heading') }}</h2>

      <!-- Auto-filled destination indicator -->
      <div v-if="currentDestination" class="dest-prefilled-banner">
        <span class="banner-icon">🎯</span>
        <div class="banner-text">
          <span class="banner-label">{{ $t('select.destPreFilledHint', { dest: btName(currentDestination) }) }}</span>
        </div>
      </div>

      <!-- Quick Origin Chips -->
      <div class="quick-section">
        <label class="quick-section-title">{{ $t('select.quickOriginLabel') }}</label>
        <div class="chips-row">
          <button
            v-for="opt in quickOriginOptions"
            :key="opt.id"
            type="button"
            class="chip-btn origin-chip"
            :class="{ active: store.originId === opt.id }"
            @click="setQuickOrigin(opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Origin dropdown -->
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

      <!-- Quick Destination Chips -->
      <div class="quick-section">
        <label class="quick-section-title">{{ $t('select.quickDestLabel') }}</label>
        <div class="chips-row">
          <button
            v-for="b in popularDestBuildings"
            :key="b.id"
            type="button"
            class="chip-btn"
            :class="{ active: store.destinationId === b.id }"
            @click="setQuickDest(b.id)"
          >
            {{ btName(b) }}
          </button>
        </div>
      </div>

      <!-- Destination dropdown -->
      <div class="field">
        <label for="destination-select">{{ $t('select.destinationLabel') }}</label>
        <select id="destination-select" :value="store.destinationId ?? ''" @change="onDestinationChange">
          <option value="" disabled>{{ $t('select.destinationPlaceholder') }}</option>
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

      <!-- Quickpick for active event locations (活動舉辦地點快速選取) -->
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

.select-top-nav {
  display: flex;
  align-items: center;
  margin-bottom: -0.5rem;
}

.back-link-btn {
  background: transparent;
  border: none;
  color: var(--fcu-maroon);
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.back-link-btn:hover {
  background: rgba(129, 27, 41, 0.08);
}

.select-card {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  width: 100%;
  max-width: 520px;
}

/* ---- Pre-filled Destination Banner ---- */
.dest-prefilled-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: linear-gradient(135deg, #fff5f0 0%, #ffe8e0 100%);
  border: 1.5px solid var(--fcu-maroon-light);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  animation: banner-pop 0.3s ease;
}
.banner-icon {
  font-size: 1.3rem;
}
.banner-label {
  font-weight: 700;
  color: var(--fcu-maroon-dark);
  font-size: 0.95rem;
}
@keyframes banner-pop {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ---- Quick Sections & Chips ---- */
.quick-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.quick-section-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-muted);
}
.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip-btn {
  background: rgba(0, 107, 147, 0.08);
  border: 1px solid var(--border);
  color: var(--fcu-blue-dark);
  padding: 0.3em 0.75em;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.chip-btn:hover {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
  border-color: var(--fcu-gold);
  transform: translateY(-1px);
}
.chip-btn.active {
  background: var(--fcu-maroon);
  color: #fff;
  border-color: var(--fcu-maroon);
}
.origin-chip {
  background: rgba(129, 27, 41, 0.06);
  color: var(--fcu-maroon-dark);
}
.origin-chip.active {
  background: var(--fcu-blue-dark);
  color: #fff;
  border-color: var(--fcu-blue-dark);
}

.event-quickpick {
  background: rgba(212, 169, 79, 0.08);
  border: 1px solid var(--fcu-gold);
  border-radius: var(--radius);
  padding: 0.75rem;
}
.event-quickpick label {
  color: var(--fcu-maroon-dark);
  font-weight: 700;
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
