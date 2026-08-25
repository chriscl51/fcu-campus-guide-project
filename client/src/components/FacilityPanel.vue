<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBilingual } from '../utils/bilingual'
import { translateFacilityText } from '../data/facilityContentI18n'
import BilingualText from './BilingualText.vue'

const props = defineProps({
  building: {
    type: Object,
    required: true,
  },
})

const { locale } = useI18n({ useScope: 'global' })
const { bt, btPair, btTitlePair } = useBilingual()

// Lightbox modal state
const isLightboxOpen = ref(false)

function openLightbox() {
  if (props.building?.photo) {
    isLightboxOpen.value = true
  }
}

function closeLightbox() {
  isLightboxOpen.value = false
}

function handleKeydown(e) {
  if (e.key === 'Escape' && isLightboxOpen.value) {
    closeLightbox()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// Photo URL helper
function photoUrl(path) {
  return `${import.meta.env.BASE_URL}${path}`
}

// Facility location text
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

    <!-- Building photo with hover zoom & magnifying glass cursor -->
    <div
      class="facility-photo-wrap"
      :class="{ 'has-photo': !!building.photo }"
      @click="openLightbox"
    >
      <div v-if="building.photo" class="photo-inner-container">
        <img
          :src="photoUrl(building.photo)"
          :alt="building.nameZh"
          class="facility-photo"
        />
        <div class="photo-zoom-hint">
          <span class="zoom-icon">🔍</span>
          <span class="zoom-text">{{ locale === 'zh-TW' ? '點擊放大檢視' : 'Click to enlarge' }}</span>
        </div>
      </div>
      <div v-else class="facility-photo-placeholder">
        <span>{{ $t('arrival.photoMissing') }}</span>
      </div>
    </div>

    <!-- Fullscreen Lightbox Modal -->
    <Teleport to="body">
      <Transition name="lightbox-fade">
        <div
          v-if="isLightboxOpen && building.photo"
          class="lightbox-overlay"
          @click="closeLightbox"
        >
          <div class="lightbox-dialog" @click.stop>
            <div class="lightbox-header">
              <span class="lightbox-title">🏢 {{ building.nameZh }} {{ building.nameEn ? `(${building.nameEn})` : '' }}</span>
              <button
                type="button"
                class="lightbox-close-btn"
                :title="locale === 'zh-TW' ? '關閉' : 'Close'"
                @click="closeLightbox"
              >
                ✕
              </button>
            </div>
            <div class="lightbox-body" @click="closeLightbox">
              <img
                :src="photoUrl(building.photo)"
                :alt="building.nameZh"
                class="lightbox-image"
              />
            </div>
            <div class="lightbox-footer">
              <span>🔍 {{ locale === 'zh-TW' ? '點擊任意處或按 ESC 鍵關閉' : 'Click anywhere or press ESC to close' }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <section v-if="building.accessNote" class="facility-section intro-section">
      <p class="building-intro-text"><BilingualText v-bind="btContentPair(building.accessNote)" /></p>
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

/* ---- Photo Hover Zoom & Magnifier Cursor ---- */
.facility-photo-wrap {
  margin: -0.25rem 0 0.25rem;
  border-radius: 12px;
  overflow: hidden;
}
.facility-photo-wrap.has-photo {
  cursor: zoom-in;
  border: 1.5px solid var(--border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}
.facility-photo-wrap.has-photo:hover {
  box-shadow: 0 8px 24px rgba(129, 27, 41, 0.2);
  border-color: var(--fcu-maroon);
}

.photo-inner-container {
  position: relative;
  width: 100%;
  height: 240px;
  overflow: hidden;
  background: #fbf9f6;
  border-radius: 10px;
}

.facility-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--bg);
  border-radius: 10px;
  display: block;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center center;
}

.facility-photo-wrap:hover .facility-photo {
  transform: scale(1.3);
}

/* Floating Zoom Hint Badge */
.photo-zoom-hint {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(30, 20, 20, 0.85);
  backdrop-filter: blur(8px);
  color: #ffffff;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.facility-photo-wrap:hover .photo-zoom-hint {
  opacity: 1;
  transform: translateY(0);
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

/* ---- Lightbox Modal ---- */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(15, 10, 10, 0.88);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.lightbox-dialog {
  max-width: 92vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #221c1c;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
}

.lightbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
  background: #181414;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
}

.lightbox-title {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.3px;
}

.lightbox-close-btn {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  color: #fff;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}
.lightbox-close-btn:hover {
  background: var(--fcu-maroon, #811b29);
  transform: scale(1.1);
}

.lightbox-body {
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: zoom-out;
}

.lightbox-image {
  max-width: 86vw;
  max-height: 72vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

.lightbox-footer {
  padding: 0.5rem 1.25rem 0.75rem;
  text-align: center;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.6);
}

/* Transitions */
.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.25s ease;
}
.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

.facility-section {
  padding-bottom: 0.25rem;
}
.facility-section + .facility-section {
  border-top: 1px solid var(--border);
  padding-top: 1.1rem;
}
.intro-section {
  background: #fbf9f6;
  border: 1px solid #efe5d8;
  border-radius: 10px;
  padding: 0.85rem 1rem !important;
}
.building-intro-text {
  margin: 0;
  line-height: 1.6;
  font-size: 0.95rem;
  color: var(--text);
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
