<script>
// Orchestrates the full visitor flow: intro -> pick origin/destination ->
// Google Maps navigation (driving or walking). All actual state lives in the
// Pinia app store; this view just switches which screen is shown based on
// store.step.
</script>

<script setup>
import { useAppStore, STEP } from '../stores/app'
import IntroSplash from '../components/IntroSplash.vue'
import SelectForm from '../components/SelectForm.vue'
import GoogleMapNav from '../components/GoogleMapNav.vue'

const store = useAppStore()

function onIntroStart() {
  store.step = STEP.SELECT
}

function onSelectSubmit() {
  store.startNavigation()
}
</script>

<template>
  <div class="guide-view">
    <IntroSplash v-if="store.step === STEP.INTRO" @start="onIntroStart" />

    <SelectForm v-else-if="store.step === STEP.SELECT" @submit="onSelectSubmit" />

    <GoogleMapNav v-else-if="store.step === STEP.NAVIGATION" />
  </div>
</template>

<style scoped>
.guide-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
