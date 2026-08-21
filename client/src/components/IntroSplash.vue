<script setup>
// The very first screen — a warm greeting from the Wenhwa Deer (文華鹿),
// FCU's mascot. Browsers block autoplay audio without a user gesture, so
// playGreeting() is only ever called from inside the button's click handler.
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { playGreeting } from '../utils/sound'
import { fetchUpcomingEvents } from '../utils/api'
import { useBilingual } from '../utils/bilingual'
import { useAppStore } from '../stores/app'

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

// Feature: admin-entered activities/events (學測/演講/研討會…) auto-appear
// here starting the day before the event, through its last day — powered by
// the optional Node.js + SQLite backend (server/). If that server isn't
// running, fetchUpcomingEvents() resolves to null and this section just
// doesn't render — the rest of the site is unaffected (see utils/api.js).
// Each event now carries a `locations` array (one event can span multiple
// buildings, e.g. 學測 held across 3 exam buildings at once).
const upcomingEvents = ref([])
onMounted(async () => {
  const events = await fetchUpcomingEvents()
  if (events) upcomingEvents.value = events
})

function locationLabel(loc) {
  return locale.value === 'zh-TW' || !loc.nameEn ? loc.nameZh : `${loc.nameZh} / ${loc.nameEn}`
}

function eventLocationSummary(e) {
  const locs = e.locations || []
  if (locs.length) return locs.map(locationLabel).join('、')
  return e.location_text || ''
}

// Feedback item: an event with a single location jumps straight into the
// guide with that destination pre-filled (same as before). An event with
// MULTIPLE locations instead expands an inline dropdown, scoped to just
// that event's buildings, right here on the landing page — no navigation —
// so the visitor can quickly pick which of the event's buildings they're
// headed to (ex. 學測 held in 3 exam buildings → only those 3 show up).
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
  <div class="intro-splash screen">
    <div class="intro-card">
      <div class="deer-wrap">
        <!-- Feedback item: use the user's own sticker artwork directly (not
             a redrawn SVG) — deerStickerFollowMe.png, animated with a simple
             left-right sway via CSS keyframes. -->
        <img src="/stickers/deer-follow-me.png" alt="文華鹿 Follow Me" class="deer-follow-sticker" />
      </div>
      <h1 class="intro-title">{{ $t('intro.title') }}</h1>
      <p class="intro-subtitle">{{ $t('intro.subtitle') }}</p>
      <button type="button" class="btn intro-start-btn" @click="onStart">
        {{ $t('intro.startButton') }}
      </button>

      <div v-if="upcomingEvents.length" class="events-banner">
        <p class="events-banner-title">{{ bt('events.upcomingTitle') }}</p>
        <ul class="events-list">
          <li
            v-for="e in upcomingEvents"
            :key="e.id"
            class="event-item"
            :class="{ clickable: (e.locations || []).length > 0 }"
            @click="onEventClick(e)"
          >
            <div class="event-item-row">
              <span class="event-type-tag">{{ e.type }}</span>
              <span class="event-title">{{ e.title }}</span>
              <span class="event-meta">
                {{ e.start_date }}<span v-if="e.end_date !== e.start_date"> – {{ e.end_date }}</span>
                <template v-if="eventLocationSummary(e)"> · {{ eventLocationSummary(e) }}</template>
              </span>
            </div>
            <p v-if="e.description" class="event-description">{{ e.description }}</p>
            <div v-if="expandedEventId === e.id" class="event-location-picker" @click.stop>
              <select :value="''" @change="onEventLocationPick($event, e)">
                <option value="" disabled>{{ $t('select.eventLocationPlaceholder') }}</option>
                <option v-for="loc in e.locations" :key="loc.buildingId" :value="loc.buildingId">
                  {{ loc.officialCode ? `${loc.officialCode}｜` : '' }}{{ locationLabel(loc) }}
                </option>
              </select>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro-splash {
  min-height: 100vh;
  min-height: 100dvh;
  justify-content: center;
  background: linear-gradient(160deg, var(--fcu-maroon) 0%, var(--fcu-maroon-dark) 55%, var(--fcu-blue-dark) 100%);
  color: #fff;
}

.intro-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
  max-width: 480px;
  width: 100%;
  animation: intro-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.deer-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-bottom: 0.25rem;
  overflow: visible;
}

.deer-follow-sticker {
  width: clamp(220px, 62vw, 340px);
  height: auto;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.3));
  animation: deer-sway 2.4s ease-in-out infinite;
}

@keyframes deer-sway {
  0%,
  100% {
    transform: translateX(-14px) rotate(-2deg);
  }
  50% {
    transform: translateX(14px) rotate(2deg);
  }
}

.intro-title {
  color: #fff;
  font-size: clamp(1.5rem, 5vw, 2.1rem);
  margin: 0;
}

.intro-subtitle {
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(1rem, 3vw, 1.15rem);
  margin: 0 0 0.5rem;
  max-width: 36ch;
}

.intro-start-btn {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
  font-size: 1.15rem;
  padding: 0.85em 2.2em;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
}
.intro-start-btn:hover {
  background: #e6bf6c;
}

.events-banner {
  margin-top: 0.75rem;
  width: 100%;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  text-align: left;
}
.events-banner-title {
  margin: 0 0 0.5rem;
  font-weight: 700;
  font-size: 0.95rem;
  color: #fff;
}
.events-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.event-item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 0.3rem 0.4rem;
  margin: -0.3rem -0.4rem;
}
.event-item.clickable {
  cursor: pointer;
}
.event-item.clickable:hover {
  background: rgba(255, 255, 255, 0.1);
}
.event-item-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
}
.event-location-picker {
  padding-top: 0.15rem;
}
.event-location-picker select {
  width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.95);
  color: var(--text-dark, #222);
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
}
.event-type-tag {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
  font-weight: 700;
  font-size: 0.75rem;
  padding: 0.1em 0.55em;
  border-radius: 999px;
}
.event-title {
  font-weight: 600;
}
.event-meta {
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.82rem;
}
.event-description {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.88);
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
  .intro-card {
    gap: 0.75rem;
  }
}
</style>
