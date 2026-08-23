<script setup>
// The very first screen — a warm greeting from the Wenhwa Deer (文華鹿),
// FCU's mascot, alongside a campus event announcement board. Browsers block
// autoplay audio without a user gesture, so playGreeting() is only ever
// called from inside the button's click handler.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { playGreeting } from '../utils/sound'
import { fetchUpcomingEvents } from '../utils/api'
import { useBilingual } from '../utils/bilingual'
import { formatWallClock, formatTaipeiInstant } from '../utils/dateFormat'
import { useAppStore } from '../stores/app'
import { useAnnouncementsStore } from '../stores/announcements'
import { publicUrl } from '../utils/publicUrl'
import buildings from '../data/buildings.json'

const emit = defineEmits(['start'])
const { locale } = useI18n({ useScope: 'global' })
const { bt } = useBilingual()
const store = useAppStore()
const announcementsStore = useAnnouncementsStore()

const started = ref(false)

function onStart() {
  if (started.value) return
  started.value = true
  playGreeting()
  emit('start')
}

// Feature: admin-entered activities/events (學測/演講/研討會…) auto-appear
// on the announcement board starting the day before the event, through its
// last day — powered by the optional Node.js + SQLite backend (server/). If
// that server isn't running, fetchUpcomingEvents() resolves to null and the
// board just shows its empty state — the rest of the site is unaffected
// (see utils/api.js). Each event carries a `locations` array (one event can
// span multiple buildings, e.g. 學測 held across 3 exam buildings at once).
const upcomingEvents = ref([])
onMounted(async () => {
  const events = await fetchUpcomingEvents()
  if (events) upcomingEvents.value = events
})

// Feedback item: the board only shows the first 3 items by default, with a
// show more/less toggle for the rest — keeps the card from growing
// unbounded on a busy exam season.
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

// start_date/end_date come back as 'YYYY-MM-DD' (older rows) or
// 'YYYY-MM-DDTHH:MM' (current admin form, which now collects a time too —
// feedback item: the board needs to show event start/end TIME, not just
// date). Format with the visitor's locale (month spelled out, GMT+8 wall
// clock — see utils/dateFormat.js); only show a time portion when one is
// actually present in the raw value.
function formatEventDateTime(value) {
  return formatWallClock(value, locale.value)
}

function eventDateRange(e) {
  const start = formatEventDateTime(e.start_date)
  const end = formatEventDateTime(e.end_date)
  return e.start_date === e.end_date ? start : `${start} – ${end}`
}

// created_at is written by SQLite's datetime('now') — UTC, 'YYYY-MM-DD
// HH:MM:SS' — this is the announcement's PUBLISH time (distinct from the
// event's own start/end), another board field the feedback asked for.
function eventPublishedAt(e) {
  if (!e.created_at) return ''
  const iso = e.created_at.includes('T') ? e.created_at : `${e.created_at.replace(' ', 'T')}Z`
  return formatTaipeiInstant(iso, locale.value)
}

// Feedback item: an event with a single location jumps straight into the
// guide with that destination pre-filled. An event with MULTIPLE locations
// instead expands an inline dropdown, scoped to just that event's
// buildings, right here on the board — no navigation — so the visitor can
// quickly pick which of the event's buildings they're headed to (ex. 學測
// held in 3 exam buildings → only those 3 show up).
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

// Feature: building-change announcements (整修中、廁所故障、停水停電…) now show
// on the landing page too, not just on that building's own facility page —
// a visitor should see "游泳池暫停開放" the moment they land, without first
// having to pick a route to find out. Only announcements whose date window
// currently covers today are shown here (see stores/announcements.js's
// `activeNow`); FacilityPanel.vue still lists the building's full history.
const buildingsById = Object.fromEntries(buildings.map((b) => [b.id, b]))
const activeAnnouncements = computed(() => announcementsStore.activeNow)

function announcementBuildingLabel(a) {
  const b = buildingsById[a.buildingId]
  if (!b) return ''
  return locationLabel(b)
}

function onAnnouncementClick(a) {
  store.setDestination(a.buildingId)
  onStart()
}
</script>

<template>
  <div class="intro-splash">
    <div class="intro-layout">
      <!-- Right card (top on mobile): Wenhwa Deer greeting + start button. -->
      <div class="intro-card deer-card">
        <div class="deer-wrap">
          <!-- Feedback item: use the user's own sticker artwork directly (not
               a redrawn SVG) — deerStickerFollowMe.png, animated with a simple
               left-right sway via CSS keyframes. -->
          <img :src="publicUrl('stickers/deer-follow-me.png')" alt="文華鹿 Follow Me" class="deer-follow-sticker" />
        </div>
        <h1 class="intro-title">{{ $t('intro.title') }}</h1>
        <p class="intro-subtitle">{{ $t('intro.subtitle') }}</p>
        <button type="button" class="btn intro-start-btn" @click="onStart">
          {{ $t('intro.startButton') }}
        </button>
        <a
          class="campus-map-link"
          :href="publicUrl('map/FCU%20Campus.pdf')"
          target="_blank"
          rel="noopener"
        >
          <span>{{ $t('intro.mapLink') }}</span>
          <img :src="publicUrl('map/click%20me%20map.png')" :alt="$t('intro.mapLink')" />
        </a>
        <a class="secondary-map-link" :href="publicUrl('map/AED.jpg')" target="_blank" rel="noopener">
          {{ $t('intro.aedMapLink') }}
        </a>
        <a class="secondary-map-link" :href="publicUrl('map/Barrier_free_map.jpg')" target="_blank" rel="noopener">
          {{ $t('intro.accessibilityMapLink') }}
        </a>
      </div>

      <!-- Left card (bottom on mobile): campus event announcement board. -->
      <div class="intro-card events-board">
        <p class="events-board-title">{{ bt('events.upcomingTitle') }}</p>

        <ul v-if="visibleEvents.length" class="events-list">
          <li
            v-for="e in visibleEvents"
            :key="e.id"
            class="event-item"
            :class="{ clickable: (e.locations || []).length > 0 }"
            @click="onEventClick(e)"
          >
            <div class="event-item-row">
              <span class="event-type-tag">{{ e.type }}</span>
              <span class="event-title">{{ e.title }}</span>
            </div>
            <p class="event-datetime">{{ eventDateRange(e) }}</p>
            <p v-if="eventLocationSummary(e)" class="event-location">📍 {{ eventLocationSummary(e) }}</p>
            <p v-if="e.created_at" class="event-published">
              {{ $t('events.publishedLabel', { time: eventPublishedAt(e) }) }}
            </p>
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
        <p v-else class="events-board-empty">{{ $t('events.emptyBoard') }}</p>

        <button
          v-if="hasMoreEvents"
          type="button"
          class="events-toggle-btn"
          @click="showAllEvents = !showAllEvents"
        >
          {{ showAllEvents ? $t('events.showLess') : $t('events.showMore') }}
        </button>

        <!-- Feature: active building-change announcements (整修中/廁所故障/停水
             停電…) surfaced right on the landing page — see onAnnouncementClick. -->
        <template v-if="activeAnnouncements.length">
          <p class="events-board-title announcements-title">{{ bt('facility.announcementsTitle') }}</p>
          <ul class="events-list">
            <li
              v-for="a in activeAnnouncements"
              :key="a.id"
              class="event-item clickable"
              @click="onAnnouncementClick(a)"
            >
              <div class="event-item-row">
                <span class="event-type-tag">{{ $t(`announcementType.${a.type}`) }}</span>
                <span class="event-title">{{ announcementBuildingLabel(a) }}</span>
              </div>
              <p class="event-location">{{ a.message }}</p>
              <p v-if="a.startDate || a.endDate" class="event-datetime">
                {{ formatWallClock(a.startDate, locale) }}<span v-if="a.startDate && a.endDate"> – </span>{{ formatWallClock(a.endDate, locale) }}
              </p>
            </li>
          </ul>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Full-bleed background wrapper: unlike the shared `.screen` utility (which
   also caps content at max-width:960px), the gradient here needs to cover
   the ENTIRE viewport width — the feedback item was that the maroon/blue
   gradient stopped at 960px and left the app's plain background color
   showing on both sides on wide screens. So the gradient lives on this
   full-width wrapper, and max-width centering happens one level down on
   .intro-layout instead. */
.intro-splash {
  flex: 1;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  background: linear-gradient(160deg, var(--fcu-maroon) 0%, var(--fcu-maroon-dark) 55%, var(--fcu-blue-dark) 100%);
  color: #fff;
  padding: 1.25rem 1rem 2.5rem;
}

.intro-layout {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas: 'deer' 'board';
  gap: 1rem;
  align-items: start;
  animation: intro-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (min-width: 860px) {
  .intro-layout {
    grid-template-columns: 1fr 1.05fr;
    grid-template-areas: 'board deer';
    gap: 1.5rem;
    align-items: center;
  }
}

.intro-card {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  padding: 1.1rem 1.1rem 1.25rem;
}

.deer-card {
  --intro-heading-size: clamp(1.25rem, 4vw, 2.1rem);
  grid-area: deer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.9rem;
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
  min-height: 100%;
}

.deer-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: visible;
}

.deer-follow-sticker {
  width: clamp(220px, 42vw, 380px);
  max-width: 100%;
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
  font-size: var(--intro-heading-size);
  margin: 0;
}

.intro-subtitle {
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(0.9rem, 2.4vw, 1.15rem);
  margin: 0;
  max-width: 36ch;
}

.intro-start-btn {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
  font-size: clamp(1.2rem, 3.5vw, 1.7rem);
  padding: 0.65em 1.9em;
  margin-top: 1rem;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
}
.intro-start-btn:hover {
  background: #e6bf6c;
}

.campus-map-link {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  color: #fff;
  font-size: var(--intro-heading-size);
  font-weight: 700;
  text-decoration: none;
  margin-top: 0.7rem;
}
.campus-map-link img {
  width: clamp(165px, 35vw, 258px);
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);
}
.campus-map-link:hover,
.campus-map-link:focus-visible {
  color: var(--fcu-gold);
  text-decoration: underline;
}
.campus-map-link:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 4px;
}
.secondary-map-link {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.32rem;
  font-weight: 600;
  text-decoration: underline;
}
.secondary-map-link:hover,
.secondary-map-link:focus-visible {
  color: var(--fcu-gold);
}
.secondary-map-link:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 4px;
}

/* ---- Events board (公佈欄) ------------------------------------------- */
.events-board {
  grid-area: board;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-align: left;
}
.events-board-title {
  margin: 0;
  font-weight: 700;
  font-size: 1.32rem;
  color: #fff;
}
.announcements-title {
  margin-top: 0.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}
.events-board-empty {
  margin: 0;
  font-size: 1.32rem;
  color: rgba(255, 255, 255, 0.75);
}
.events-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.event-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 1.32rem;
  color: rgba(255, 255, 255, 0.95);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  background: rgba(255, 255, 255, 0.06);
}
.event-item.clickable {
  cursor: pointer;
}
.event-item.clickable:hover {
  background: rgba(255, 255, 255, 0.14);
}
.event-item-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem;
}
.event-type-tag {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
  font-weight: 700;
  font-size: 1rem;
  padding: 0.1em 0.55em;
  border-radius: 999px;
}
.event-title {
  font-weight: 600;
}
.event-datetime {
  margin: 0;
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.85);
}
.event-location {
  margin: 0;
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.85);
}
.event-published {
  margin: 0;
  font-size: 1.05rem;
  color: rgba(255, 255, 255, 0.6);
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
.events-toggle-btn {
  align-self: center;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #fff;
  border-radius: 999px;
  padding: 0.35em 1.2em;
  font-size: 1.1rem;
  font-weight: 600;
}
.events-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.12);
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

/* On mobile the board sits below the deer card, so spacing is tightened while
  the deer remains larger than the map preview. */
@media (max-width: 859px) {
  .intro-splash {
    padding: 0.85rem 0.75rem 2rem;
  }
  .intro-layout {
    gap: 0.65rem;
  }
  .deer-card {
    gap: 0.35rem;
    padding: 0;
  }
  .deer-follow-sticker {
    width: clamp(190px, 45vw, 250px);
  }
  .intro-subtitle {
    margin: 0;
  }
  .intro-start-btn {
    padding: 0.55em 1.8em;
    font-size: 1rem;
    margin-top: 1.4rem;
  }
  .intro-card.events-board {
    padding: 0.85rem 0.85rem 1rem;
  }
}

/* Short-viewport phones (landscape or small screens like SE): compact the
   deer card further so it never pushes the board's header/first item
   offscreen. */
@media (max-width: 859px) and (max-height: 700px) {
  .intro-splash {
    padding-top: 0.6rem;
  }
  .intro-layout {
    gap: 0.45rem;
  }
  .deer-follow-sticker {
    width: clamp(180px, 42vw, 230px);
  }
  .intro-subtitle {
    display: none;
  }
  .intro-start-btn {
    padding: 0.45em 1.5em;
    font-size: 0.92rem;
    margin-top: 1.2rem;
  }
}
</style>
