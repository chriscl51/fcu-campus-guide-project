<script setup>
// The very first screen — greeting from the Wenhwa Deer (文華鹿),
// alongside the campus event announcement board.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { playGreeting } from '../utils/sound'
import { fetchUpcomingEvents } from '../utils/api'
import { useBilingual } from '../utils/bilingual'
import { formatWallClock } from '../utils/dateFormat'
import { useAppStore } from '../stores/app'
import { publicUrl } from '../utils/publicUrl'

const emit = defineEmits(['start'])
const { locale } = useI18n({ useScope: 'global' })
const { bt } = useBilingual()
const store = useAppStore()

const started = ref(false)

function onStart() {
  if (started.value) return
  started.value = true
  playGreeting()
  emit('start')
}

// Feature: admin-entered activities/events (活動通報)
const upcomingEvents = ref([])
onMounted(async () => {
  const events = await fetchUpcomingEvents()
  if (events) upcomingEvents.value = events
})

const BOARD_PAGE_SIZE = 3
const showAllEvents = ref(false)
const hasMoreEvents = computed(() => upcomingEvents.value.length > BOARD_PAGE_SIZE)
const visibleEvents = computed(() =>
  showAllEvents.value ? upcomingEvents.value : upcomingEvents.value.slice(0, BOARD_PAGE_SIZE)
)

function locationLabel(loc) {
  return locale.value === 'zh-TW' || !loc.nameEn ? loc.nameZh : `${loc.nameZh} / ${loc.nameEn}`
}

function eventLocationSummary(e) {
  const locs = e.locations || []
  if (locs.length) return locs.map(locationLabel).join('、')
  return e.location_text || ''
}

function eventDateRange(e) {
  const start = formatWallClock(e.start_date, locale.value)
  const end = formatWallClock(e.end_date, locale.value)
  return e.start_date === e.end_date ? start : `${start} – ${end}`
}

const expandedEventId = ref(null)

function onEventClick(e) {
  const locs = e.locations || []
  if (locs.length === 0) return
  if (locs.length === 1) {
    chooseLocation(locs[0])
    return
  }
  expandedEventId.value = expandedEventId.value === e.id ? null : e.id
}

function chooseLocation(loc) {
  store.setDestination(loc.buildingId)
  expandedEventId.value = null
  onStart()
}

function onEventLocationPick(ev, e) {
  const buildingId = ev.target.value
  const loc = (e.locations || []).find((l) => l.buildingId === buildingId)
  if (loc) chooseLocation(loc)
}
</script>

<template>
  <div class="intro-splash">
    <div class="intro-layout">
      <!-- Left column: Campus Event Announcements Board (活動通報公佈欄) -->
      <div class="intro-card events-board">
        <p class="events-board-title">{{ bt('events.upcomingTitle') }}</p>

        <p v-if="upcomingEvents.length === 0" class="events-board-empty">
          {{ $t('events.emptyBoard') }}
        </p>

        <ul v-else class="events-list">
          <li
            v-for="e in visibleEvents"
            :key="e.id"
            class="event-item"
            :class="{ clickable: (e.locations || []).length > 0 }"
            @click="onEventClick(e)"
          >
            <div class="event-item-row">
              <span class="event-type-tag">{{ $t(`eventType.${e.type}`) }}</span>
              <span class="event-title">{{ e.title }}</span>
            </div>
            <p class="event-datetime">{{ eventDateRange(e) }}</p>
            <p v-if="eventLocationSummary(e)" class="event-location">📍 {{ eventLocationSummary(e) }}</p>
            <p v-if="e.description" class="event-desc">{{ e.description }}</p>

            <!-- Multi-location building picker dropdown -->
            <div v-if="expandedEventId === e.id && (e.locations || []).length > 1" class="event-location-picker" @click.stop>
              <select :value="''" @change="onEventLocationPick($event, e)">
                <option value="" disabled>{{ $t('select.destinationPlaceholder') }}</option>
                <option v-for="loc in e.locations" :key="loc.buildingId" :value="loc.buildingId">
                  {{ loc.officialCode ? `${loc.officialCode}｜` : '' }}{{ locationLabel(loc) }}
                </option>
              </select>
            </div>
          </li>
        </ul>

        <button
          v-if="hasMoreEvents"
          type="button"
          class="events-toggle-btn"
          @click="showAllEvents = !showAllEvents"
        >
          {{ showAllEvents ? $t('events.showLess') : $t('events.showMore') }}
        </button>
      </div>

      <!-- Right column: Wenhwa Deer greeting card + start button + campus maps -->
      <div class="intro-card deer-card">
        <div class="deer-wrap">
          <img
            :src="publicUrl('stickers/deer-follow-me.png')"
            alt="文華鹿 Follow Me"
            class="deer-follow-sticker"
          />
        </div>
        <h1 class="intro-title">{{ $t('intro.title') }}</h1>
        <p class="intro-subtitle">{{ $t('intro.subtitle') }}</p>

        <button type="button" class="btn intro-start-btn" @click="onStart">
          {{ $t('intro.startButton') }}
        </button>

        <div class="map-links-group">
          <a
            class="campus-map-link"
            :href="publicUrl('map/FCU%20Campus.pdf')"
            target="_blank"
            rel="noopener"
          >
            <span class="campus-map-title">{{ $t('intro.mapLink') }}</span>
            <div class="map-thumbnail-wrap">
              <img :src="publicUrl('map/click%20me%20map.png')" :alt="$t('intro.mapLink')" />
            </div>
          </a>

          <div class="secondary-links">
            <a
              class="secondary-map-link"
              :href="publicUrl('map/AED.jpg')"
              target="_blank"
              rel="noopener"
            >
              {{ $t('intro.aedMapLink') }}
            </a>
            <a
              class="secondary-map-link"
              :href="publicUrl('map/Barrier_free_map.jpg')"
              target="_blank"
              rel="noopener"
            >
              {{ $t('intro.accessibilityMapLink') }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro-splash {
  flex: 1;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(160deg, var(--fcu-maroon) 0%, var(--fcu-maroon-dark) 55%, var(--fcu-blue-dark) 100%);
  color: #fff;
  padding: 1.5rem 1rem 3rem;
}

.intro-layout {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas: 'deer' 'board';
  gap: 1.5rem;
  align-items: center;
  animation: intro-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (min-width: 860px) {
  .intro-layout {
    grid-template-columns: 1fr 1.05fr;
    grid-template-areas: 'board deer';
    gap: 2.5rem;
    align-items: center;
  }
}

.intro-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  padding: 1.5rem;
}

.deer-card {
  --intro-heading-size: clamp(1.4rem, 4.5vw, 2.2rem);
  grid-area: deer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 1.1rem;
  background: transparent;
  border: none;
  padding: 0.5rem;
}

.deer-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: visible;
}

.deer-follow-sticker {
  width: clamp(220px, 40vw, 320px);
  max-width: 100%;
  height: auto;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.35));
  animation: deer-sway 2.4s ease-in-out infinite;
}

@keyframes deer-sway {
  0%,
  100% {
    transform: translateX(-12px) rotate(-2deg);
  }
  50% {
    transform: translateX(12px) rotate(2deg);
  }
}

.intro-title {
  color: #fff;
  font-size: var(--intro-heading-size);
  margin: 0;
}

.intro-subtitle {
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(1rem, 2.5vw, 1.25rem);
  margin: 0;
  max-width: 36ch;
}

.intro-start-btn {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
  font-size: clamp(1.2rem, 3.5vw, 1.65rem);
  padding: 0.7em 2.4em;
  margin-top: 0.5rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  font-weight: 700;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}
.intro-start-btn:hover {
  background: #e6bf6c;
  transform: translateY(-2px);
}

.map-links-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  margin-top: 0.5rem;
  width: 100%;
}

.campus-map-link {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  color: #fff;
  text-decoration: none;
  transition: transform 0.2s ease;
}
.campus-map-title {
  font-size: clamp(1.15rem, 2.8vw, 1.4rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.04em;
  transition: color 0.15s ease;
}
.map-thumbnail-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 0.55rem 1.1rem;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.campus-map-link:hover .map-thumbnail-wrap {
  transform: translateY(-2px) scale(1.03);
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}
.campus-map-link img {
  width: 135px;
  max-width: 100%;
  height: auto;
  display: block;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.3));
}
.campus-map-link:hover .campus-map-title {
  color: var(--fcu-gold);
}

.secondary-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem 1.5rem;
}

.secondary-map-link {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.05rem;
  font-weight: 600;
  text-decoration: underline;
}
.secondary-map-link:hover,
.secondary-map-link:focus-visible {
  color: var(--fcu-gold);
}

/* ---- Events board (活動通報公佈欄) ---- */
.events-board {
  grid-area: board;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  max-height: 520px;
  overflow-y: auto;
}

.events-board-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
}

.events-board-empty {
  margin: 0;
  font-size: 1.05rem;
  color: rgba(255, 255, 255, 0.75);
  padding: 1rem 0;
}

.events-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-item {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  transition: background 0.15s ease, transform 0.15s ease;
}

.event-item.clickable {
  cursor: pointer;
}
.event-item.clickable:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.event-item-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.event-type-tag {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15em 0.55em;
  border-radius: 6px;
}

.event-title {
  font-weight: 700;
  font-size: 1.05rem;
  color: #fff;
}

.event-datetime,
.event-location,
.event-desc {
  margin: 0;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.85);
}

.event-location {
  font-weight: 600;
  color: #fff;
}

.event-location-picker select {
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.4em 0.6em;
  border-radius: 8px;
  background: #fff;
  color: var(--text);
  font-weight: 600;
}

.events-toggle-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #fff;
  padding: 0.4em 1em;
  border-radius: 8px;
  cursor: pointer;
  align-self: center;
  font-size: 0.9rem;
}
.events-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

@keyframes intro-rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .intro-splash {
    padding: 1.25rem 0.75rem 2.5rem;
  }
  .deer-card {
    gap: 0.8rem;
  }
  .deer-follow-sticker {
    width: clamp(200px, 50vw, 280px);
  }
  .intro-start-btn {
    padding: 0.6em 1.8em;
  }
  .secondary-links {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>
