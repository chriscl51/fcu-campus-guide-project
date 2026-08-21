<script setup>
import { onMounted } from 'vue'
import { playArrivalPing } from '../utils/sound'

const props = defineProps({
  building: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['view-facilities', 'plan-another'])

onMounted(() => {
  playArrivalPing()
})

// building.photo is a root-relative path into public/buildings/ (e.g.
// "buildings/library.jpg") — prefix BASE_URL so this also works when the
// site is deployed under a sub-path, not just at the domain root.
function photoUrl(path) {
  return `${import.meta.env.BASE_URL}${path}`
}
</script>

<template>
  <div class="arrival-backdrop">
    <div class="arrival-modal card" role="dialog" aria-modal="true" :aria-label="$t('arrival.title', { name: building.nameZh })">
      <button
        type="button"
        class="close-btn"
        :aria-label="$t('common.close')"
        @click="emit('plan-another')"
      >
        &times;
      </button>

      <h2 class="arrival-title">{{ $t('arrival.title', { name: building.nameZh }) }}</h2>

      <div class="photo-wrap">
        <img
          v-if="building.photo"
          :src="photoUrl(building.photo)"
          :alt="building.nameZh"
          class="arrival-photo"
        />
        <div v-else class="photo-placeholder">
          <span>{{ $t('arrival.photoMissing') }}</span>
        </div>
      </div>

      <div class="arrival-actions">
        <button type="button" class="btn" @click="emit('view-facilities')">
          {{ $t('arrival.viewFacilities') }}
        </button>
        <button type="button" class="btn secondary" @click="emit('plan-another')">
          {{ $t('arrival.planAnother') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arrival-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(43, 35, 32, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  z-index: 1000;
}

.arrival-modal {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  text-align: center;
  animation: pop-in 0.2s ease;
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.close-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 2rem;
  height: 2rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.5rem;
  line-height: 1;
  border-radius: 999px;
}
.close-btn:hover {
  background: rgba(129, 27, 41, 0.08);
  color: var(--fcu-maroon);
}

.arrival-title {
  margin-right: 1.5rem;
  font-size: 1.25rem;
}

.photo-wrap {
  margin: 1rem 0 1.25rem;
}

.arrival-photo {
  width: 100%;
  height: 260px;
  object-fit: contain;
  background: var(--bg);
  border-radius: 10px;
  display: block;
}

.photo-placeholder {
  width: 100%;
  min-height: 160px;
  border: 2px dashed var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  padding: 1rem;
  text-align: center;
}

.arrival-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

@media (min-width: 480px) {
  .arrival-actions {
    flex-direction: row;
    justify-content: center;
  }
  .arrival-actions .btn {
    flex: 1;
  }
}

@media (max-width: 640px) {
  .arrival-modal {
    padding: 1rem;
  }
}
</style>
