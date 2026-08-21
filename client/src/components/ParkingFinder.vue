<script setup>
// Spec 1.b / 2.b: after choosing "🚗 開車" as origin + a destination, help the
// driver find (and confirm) a parking lot before walking directions start.
import { ref, computed, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { parkingLots } from '../utils/parking'
import { googleMapsDirectionsUrl, googleMapsEmbedUrl } from '../utils/mapsLink'

const store = useAppStore()

const emit = defineEmits(['confirm', 'back'])

const suggested = computed(() => store.suggestedParking)

// Defaults to the suggested lot; the user may override via the dropdown.
const selectedLotId = ref(suggested.value?.id ?? null)

watch(
  suggested,
  (lot) => {
    selectedLotId.value = lot?.id ?? null
  },
  { immediate: true }
)

const selectedLot = computed(
  () => parkingLots.find((lot) => lot.id === selectedLotId.value) || suggested.value || null
)

function onLotChange(e) {
  selectedLotId.value = e.target.value
}

function openInGoogleMaps() {
  const lot = selectedLot.value
  if (!lot) return
  const url = googleMapsDirectionsUrl(lot.lat, lot.lon)
  window.open(url, '_blank')
}

// Feedback item: show Google Maps side-by-side with the lot picker instead
// of only a link-out button, so the user can look at the map and pick the
// nearest lot in the same view — updates live as the dropdown selection
// changes. See utils/mapsLink.js for why this is a plain embed URL, not the
// official (paid) Maps Embed API.
const embedUrl = computed(() => {
  const lot = selectedLot.value
  return lot ? googleMapsEmbedUrl(lot.lat, lot.lon) : null
})

function onConfirm() {
  const lot = selectedLot.value
  if (!lot) return
  emit('confirm', { lat: lot.lat, lon: lot.lon, name: lot.name })
}

function onBack() {
  emit('back')
}
</script>

<template>
  <div class="parking-finder screen">
    <div class="parking-grid">
      <!-- Left: the in-app, interactive campus route planning — trip recap +
           lot picker + confirm. Stays put while the right card shows Google
           Maps, so the user can compare both at once (spec item 8). -->
      <div class="card trip-card">
        <h2>{{ $t('parking.leftCardTitle') }}</h2>
        <p class="trip-recap">
          🚗 → <strong>{{ store.destinationBuilding?.nameZh }}</strong>
        </p>

        <template v-if="suggested">
          <p class="lot-name">{{ selectedLot?.name }}</p>
          <p class="lot-distance">
            {{ $t('parking.distanceLabel', { distance: selectedLot?.distanceMeters ?? suggested.distanceMeters }) }}
          </p>

          <div class="field lot-select-field">
            <label for="lot-select">{{ $t('parking.chooseLotLabel') }}</label>
            <select id="lot-select" :value="selectedLotId" @change="onLotChange">
              <option v-for="lot in parkingLots" :key="lot.id" :value="lot.id">
                {{ lot.name }}
              </option>
            </select>
          </div>

          <div class="parking-actions">
            <button type="button" class="btn ghost" @click="onBack">
              {{ $t('parking.backButton') }}
            </button>
            <button type="button" class="btn" @click="onConfirm">
              {{ $t('parking.confirmButton') }}
            </button>
          </div>
        </template>
      </div>

      <!-- Right: a live Google Maps view of whichever lot is selected on the
           left, so switching the dropdown updates this side immediately. -->
      <div class="card map-card">
        <h2>{{ $t('parking.rightCardTitle') }}</h2>
        <template v-if="embedUrl">
          <iframe
            class="maps-embed"
            :src="embedUrl"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            :title="$t('parking.rightCardTitle')"
          ></iframe>
          <button type="button" class="btn secondary maps-btn" @click="openInGoogleMaps">
            {{ $t('parking.openInGoogleMaps') }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.parking-finder {
  justify-content: flex-start;
}

.parking-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 1.25rem;
  width: 100%;
  align-items: start;
}

.trip-card,
.map-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.maps-embed {
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 0;
  border-radius: 10px;
  min-height: 260px;
}

.trip-recap {
  font-size: 1.1rem;
}

.lot-name {
  font-weight: 700;
  font-size: 1.05rem;
  margin: 0;
}

.lot-distance {
  color: var(--text-muted);
  margin: 0;
}

.maps-btn {
  align-self: flex-start;
}

.lot-select-field {
  margin-top: 0.25rem;
}

.parking-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}
.parking-actions .btn {
  flex: 1 1 auto;
}

@media (max-width: 720px) {
  .parking-grid {
    grid-template-columns: 1fr;
  }
}
</style>
