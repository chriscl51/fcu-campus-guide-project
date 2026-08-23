<script setup>
// Feedback item: driving visitors should see the auto-suggested nearest
// parking lot AND a live embedded Google Map side-by-side with the in-app
// walking-route card (GuideView renders this as the right column of a
// left/right split when store.chosenParkingLotId is set) — this restores the
// "Google Maps split-card" feature from an earlier round, but keeps this
// round's "no manual lot picker" simplification: the lot is auto-suggested,
// not chosen from a dropdown. The map is destination-only (the suggested
// lot); the origin is deliberately left blank so the visitor enters their
// own starting point inside Google Maps (see utils/mapsLink.js for why).
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { googleMapsDirectionsUrl, googleMapsEmbedUrl } from '../utils/mapsLink'
import { publicUrl } from '../utils/publicUrl'

const store = useAppStore()
const lot = computed(() => store.suggestedParking)
const embedUrl = computed(() => (lot.value ? googleMapsEmbedUrl(lot.value.lat, lot.value.lon) : null))

function openInGoogleMaps() {
  if (!lot.value) return
  window.open(googleMapsDirectionsUrl(lot.value.lat, lot.value.lon), '_blank')
}
</script>

<template>
  <div v-if="lot" class="card drive-map-card">
    <div class="drive-map-header">
      <!-- Feedback item: driving page shows the user's own deerStickerGo.png
           artwork directly (not redrawn), with a car-engine "just started"
           vibration effect (small fast jitter, like an idling engine). -->
      <img :src="publicUrl('stickers/deer-go.png')" alt="文華鹿 Go" class="deer-go-sticker" />
      <h2>{{ $t('parking.rightCardTitle') }}</h2>
    </div>
    <div class="drive-info-text">
      <p class="drive-info-label">{{ $t('parking.suggestedLotLabel') }}</p>
      <p class="drive-info-lot">
        🅿️ <strong>{{ lot.nameZh }}</strong>
        <span class="drive-info-distance">{{ $t('parking.distanceLabel', { distance: lot.distanceMeters }) }}</span>
      </p>
    </div>
    <iframe
      v-if="embedUrl"
      class="maps-embed"
      :src="embedUrl"
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      :title="$t('parking.rightCardTitle')"
    ></iframe>
    <button type="button" class="btn secondary maps-btn" @click="openInGoogleMaps">
      {{ $t('parking.openInGoogleMaps') }}
    </button>
  </div>
</template>

<style scoped>
.drive-map-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.drive-map-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.drive-map-header h2 {
  margin: 0;
}
.deer-go-sticker {
  width: 64px;
  height: auto;
  flex: 0 0 auto;
  animation: engine-rumble 0.15s linear infinite;
}
/* Small fast jitter — reads as an idling/just-started engine vibration
   rather than a smooth back-and-forth motion. */
@keyframes engine-rumble {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  20% {
    transform: translate(-1px, 1px) rotate(-1deg);
  }
  40% {
    transform: translate(1px, -1px) rotate(1deg);
  }
  60% {
    transform: translate(-1px, -1px) rotate(-1deg);
  }
  80% {
    transform: translate(1px, 1px) rotate(1deg);
  }
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
}
.drive-info-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.drive-info-label {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.drive-info-lot {
  margin: 0;
  font-size: 1.05rem;
}
.drive-info-distance {
  margin-left: 0.5em;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.maps-embed {
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 0;
  border-radius: 10px;
  min-height: 220px;
}
.maps-btn {
  align-self: flex-start;
}
</style>
