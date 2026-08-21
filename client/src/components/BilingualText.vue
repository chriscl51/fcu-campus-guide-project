<script setup>
// Parallel side-by-side bilingual layout (feedback item 5b): Chinese text
// first, then the target-language translation next to it, instead of the
// old "zh / target" run-on single line. Both spans inherit color/weight/size
// from whatever ancestor styles this (e.g. FacilityPanel.vue's .aed-section
// red/bold/enlarged rule) rather than hardcoding their own, so it stays
// correct wherever it's dropped in.
defineProps({
  zh: { type: String, required: true },
  target: { type: String, default: '' },
})
</script>

<template>
  <span class="bilingual">
    <span class="bilingual-zh">{{ zh }}</span>
    <span v-if="target" class="bilingual-target">{{ target }}</span>
  </span>
</template>

<style scoped>
.bilingual {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 0.7em;
  row-gap: 0.15em;
}
.bilingual-target {
  opacity: 0.82;
}
</style>
