<script setup>
// Orchestrates the full visitor flow (spec items 1–6): intro -> pick origin/
// destination -> (optional) parking finder -> animated route -> arrival ->
// facility detail. All actual state lives in the Pinia app store; this view
// just switches which screen is shown based on store.step.
import { useAppStore, STEP, DRIVE_MODE_ORIGIN } from '../stores/app'
import IntroSplash from '../components/IntroSplash.vue'
import SelectForm from '../components/SelectForm.vue'
import DriveInfoCard from '../components/DriveInfoCard.vue'
import CampusMap from '../components/CampusMap.vue'
import ArrivalModal from '../components/ArrivalModal.vue'
import FacilityPanel from '../components/FacilityPanel.vue'

const store = useAppStore()

function onIntroStart() {
  store.step = STEP.SELECT
}

// Feedback item: driving users pick their DESTINATION from the dropdown (not
// a parking lot) — the nearest lot is auto-determined and the screen jumps
// straight to the walking route, no separate confirm screen/click.
function onSelectSubmit() {
  if (store.originId === DRIVE_MODE_ORIGIN) {
    store.startDriving()
    return
  }
  const origin = store.originBuilding
  if (!origin) return
  store.computeRoute(origin.lat, origin.lon)
}

function onArrived() {
  store.arrive()
}
</script>

<template>
  <div class="guide-view">
    <IntroSplash v-if="store.step === STEP.INTRO" @start="onIntroStart" />

    <SelectForm v-else-if="store.step === STEP.SELECT" @submit="onSelectSubmit" />

    <div v-else-if="store.step === STEP.ROUTING || store.step === STEP.ARRIVED" class="screen routing-screen">
      <!-- Driving users see a left/right split: left is the in-app campus
           navigation (walking route from the suggested lot's nearest
           entrance to the destination), right is a live embedded Google Map
           pinned at the suggested parking lot (destination-only — the
           visitor fills in their own starting point inside Google Maps).
           This restores the earlier "Google Maps split-card" view, but keeps
           the no-manual-lot-picker simplification: the lot itself is
           auto-suggested, not chosen from a dropdown. Non-driving visitors
           just get the full-width campus map as before. -->
      <div v-if="store.chosenParkingLotId" class="drive-split-grid">
        <div class="drive-nav-card">
          <h2 class="drive-nav-title">{{ $t('parking.leftCardTitle') }}</h2>
          <!-- No :origin-id here on purpose: in drive mode the walk starts at
               a parking lot, which the campus artwork doesn't label, so the
               start falls back to its plain projected position. -->
          <CampusMap
            v-if="store.route"
            :route="store.route"
            :destination-building="store.destinationBuilding"
            @arrived="onArrived"
          />
        </div>
        <DriveInfoCard />
      </div>

      <CampusMap
        v-else-if="store.route"
        :route="store.route"
        :destination-building="store.destinationBuilding"
        :origin-id="store.originId"
        @arrived="onArrived"
      />

      <ArrivalModal
        v-if="store.step === STEP.ARRIVED && store.destinationBuilding && !store.destinationIsGate && !store.facilitiesOpen"
        :building="store.destinationBuilding"
        @view-facilities="store.facilitiesOpen = true"
        @plan-another="store.reset()"
      />

      <!-- Gates have no facilities/photo worth a full popup for, but arriving
           still needs SOME way back to planning a new route. -->
      <button
        v-if="store.step === STEP.ARRIVED && store.destinationIsGate"
        type="button"
        class="btn plan-another-btn"
        @click="store.reset()"
      >
        {{ $t('arrival.planAnother') }}
      </button>

      <div v-if="store.facilitiesOpen" class="facility-overlay" @click.self="store.facilitiesOpen = false">
        <div class="facility-overlay-inner card">
          <!-- Dedicated header row so the close button is a normal flex item,
               never absolutely positioned over the title/tier-pill row below —
               that's what caused the reported overlap ("完整資變閉料"). A
               flex row with its own height can never collide with content
               that starts after it in normal document flow. -->
          <div class="facility-overlay-topbar">
            <button type="button" class="btn ghost close-btn" @click="store.facilitiesOpen = false">
              {{ $t('common.close') }}
            </button>
          </div>
          <FacilityPanel :building="store.destinationBuilding" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.guide-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.routing-screen {
  /* Feedback item: give the map more room on wide screens (was 1080px,
     capping the map at a fairly small size even with the 3:1 grid ratio). */
  max-width: 1400px;
}
.drive-split-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 1.25rem;
  align-items: start;
  width: 100%;
}
.plan-another-btn {
  display: block;
  margin: 1.25rem auto 0;
}
.drive-nav-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.drive-nav-title {
  margin: 0;
  color: var(--fcu-maroon-dark);
}
@media (max-width: 900px) {
  .drive-split-grid {
    grid-template-columns: 1fr;
  }
}
.facility-overlay {
  position: fixed;
  inset: 0;
  background: rgba(43, 35, 32, 0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem;
  overflow-y: auto;
  z-index: 60;
}
.facility-overlay-inner {
  max-width: 640px;
  width: 100%;
}
.facility-overlay-topbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}
.close-btn {
  flex: 0 0 auto;
}
</style>
