<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAnnouncementsStore } from '../stores/announcements'
import { fetchAllEvents, createEvent, updateEvent, deleteEvent } from '../utils/api'
import buildings from '../data/buildings.json'
import { buildingOptionLabel, selectableBuildings } from '../utils/buildingOptions'
import { formatWallClock, formatTaipeiInstant } from '../utils/dateFormat'

// NOTE: client-side-only "lock", not real auth — see admin.disclaimer string
// shown to the user on this same screen. Read from VITE_ADMIN_PASSWORD (see
// client/.env / .env.example) so the real value stays out of source control
// — but Vite bakes VITE_-prefixed vars into the built JS at build time, so
// it's still visible in the built site's source. It only keeps casual
// visitors out, not a determined attacker.
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'fcu2026'
const SESSION_KEY = 'fcu-guide-admin'

const ANNOUNCEMENT_TYPES = ['renovation', 'restroom', 'elevator', 'water', 'power', 'other']
const availableBuildings = selectableBuildings(buildings)

const store = useAnnouncementsStore()

const isLoggedIn = ref(false)
const passwordInput = ref('')
const loginError = ref(false)

const showForm = ref(false)
const editingId = ref(null)
const savedNote = ref(false)
let savedNoteTimer = null

const importFileInput = ref(null)
const importMessage = ref('') // '', 'success', 'error'

const emptyForm = () => ({
  buildingId: availableBuildings[0]?.id || '',
  type: ANNOUNCEMENT_TYPES[0],
  startDate: '',
  endDate: '',
})

const form = reactive(emptyForm())
const formError = ref(false)

const buildingsById = computed(() => Object.fromEntries(buildings.map((b) => [b.id, b])))

function buildingName(id) {
  return buildingsById.value[id]?.nameZh || id
}

// ---- Activity/event management (Node.js + SQLite backend — server/) -----
// Separate feature from the announcements above: events power the landing-
// page "近期活動" banner and the destination-picker's event-location
// dropdown (see IntroSplash.vue / SelectForm.vue). Requires `npm run server`
// to be running; if it's not, the list below just stays empty with a note
// rather than erroring — see utils/api.js.
const activeTab = ref('announcements') // 'announcements' | 'events'
const EVENT_TYPES = ['exam', 'lecture', 'symposium', 'other']
const events = ref([])
const eventsLoadFailed = ref(false)
const showEventForm = ref(false)
const editingEventId = ref(null)
const eventFormError = ref('')
const eventSavedNote = ref(false)
let eventSavedNoteTimer = null

// Feedback item: one event announcement can span MULTIPLE buildings (e.g.
// 學測 held across 3 exam buildings at once) — buildingIds is an array, bound
// to a multi-select. See server/db.js's event_locations join table.
const emptyEventForm = () => ({
  title: '',
  type: EVENT_TYPES[0],
  buildingIds: [],
  locationText: '',
  startDate: '',
  endDate: '',
  description: '',
})
const eventForm = reactive(emptyEventForm())

function eventBuildingNames(ev) {
  const locs = ev.locations || []
  if (!locs.length) return ''
  return locs.map((l) => l.nameZh).join('、')
}

// event.start_date/end_date are 'YYYY-MM-DDTHH:MM' — a naive wall-clock
// value (as typed into the admin form, meant as Taipei time, no timezone
// attached) — vs. created_at (publish time), which comes back from SQLite
// as 'YYYY-MM-DD HH:MM:SS' UTC, a real instant that needs converting to
// Asia/Taipei (GMT+8) for display. See utils/dateFormat.js.
function formatEventDateTime(value) {
  if (!value) return ''
  if (value.includes('T')) return formatWallClock(value, 'zh-TW', { withYear: true })
  return formatTaipeiInstant(`${value.replace(' ', 'T')}Z`, 'zh-TW', { withYear: true })
}

function onEventBuildingsChange(e) {
  eventForm.buildingIds = Array.from(e.target.selectedOptions).map((opt) => opt.value)
}

async function loadEvents() {
  const rows = await fetchAllEvents()
  if (rows) {
    events.value = rows
    eventsLoadFailed.value = false
  } else {
    eventsLoadFailed.value = true
  }
}

function startAddEvent() {
  editingEventId.value = null
  Object.assign(eventForm, emptyEventForm())
  eventFormError.value = ''
  showEventForm.value = true
}

function startEditEvent(ev) {
  editingEventId.value = ev.id
  Object.assign(eventForm, {
    title: ev.title,
    type: ev.type,
    buildingIds: (ev.locations || []).map((l) => l.buildingId),
    locationText: ev.location_text || '',
    startDate: ev.start_date,
    endDate: ev.end_date,
    description: ev.description || '',
  })
  eventFormError.value = ''
  showEventForm.value = true
}

function cancelEventForm() {
  showEventForm.value = false
  editingEventId.value = null
  eventFormError.value = ''
}

function flashEventSavedNote() {
  eventSavedNote.value = true
  if (eventSavedNoteTimer) clearTimeout(eventSavedNoteTimer)
  eventSavedNoteTimer = setTimeout(() => {
    eventSavedNote.value = false
  }, 3000)
}

async function saveEventForm() {
  if (!eventForm.title.trim() || !eventForm.startDate || !eventForm.endDate) {
    eventFormError.value = 'incomplete'
    return
  }
  if (eventForm.endDate < eventForm.startDate) {
    eventFormError.value = 'dateOrder'
    return
  }
  eventFormError.value = ''

  const payload = {
    title: eventForm.title.trim(),
    type: eventForm.type,
    buildingIds: eventForm.buildingIds,
    locationText: eventForm.locationText.trim(),
    startDate: eventForm.startDate,
    endDate: eventForm.endDate,
    description: eventForm.description.trim(),
  }

  const result = editingEventId.value
    ? await updateEvent(editingEventId.value, payload, ADMIN_PASSWORD)
    : await createEvent(payload, ADMIN_PASSWORD)

  if (!result) {
    eventFormError.value = 'serverUnreachable'
    return
  }

  showEventForm.value = false
  editingEventId.value = null
  flashEventSavedNote()
  await loadEvents()
}

async function deleteEventItem(id) {
  const ok = await deleteEvent(id, ADMIN_PASSWORD)
  if (ok) {
    flashEventSavedNote()
    await loadEvents()
  }
}

onMounted(() => {
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    isLoggedIn.value = true
  }
  store.loadBaseline()
  loadEvents()
})

function login() {
  if (passwordInput.value === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, '1')
    isLoggedIn.value = true
    loginError.value = false
    passwordInput.value = ''
  } else {
    loginError.value = true
  }
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY)
  isLoggedIn.value = false
  showForm.value = false
}

function startAdd() {
  editingId.value = null
  Object.assign(form, emptyForm())
  formError.value = false
  showForm.value = true
}

function startEdit(announcement) {
  editingId.value = announcement.id
  Object.assign(form, {
    buildingId: announcement.buildingId,
    type: announcement.type,
    startDate: announcement.startDate || '',
    endDate: announcement.endDate || '',
  })
  formError.value = false
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  editingId.value = null
  formError.value = false
}

function flashSavedNote() {
  savedNote.value = true
  if (savedNoteTimer) clearTimeout(savedNoteTimer)
  savedNoteTimer = setTimeout(() => {
    savedNote.value = false
  }, 3000)
}

function saveForm() {
  if (!form.buildingId) {
    formError.value = true
    return
  }
  formError.value = false

  const payload = {
    buildingId: form.buildingId,
    type: form.type,
    startDate: form.startDate,
    endDate: form.endDate,
  }

  if (editingId.value) {
    store.update(editingId.value, payload)
  } else {
    store.add(payload)
  }

  showForm.value = false
  editingId.value = null
  flashSavedNote()
}

function deleteAnnouncement(id) {
  store.remove(id)
  flashSavedNote()
}

function exportData() {
  const json = store.exportJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'announcements.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importMessage.value = ''
  importFileInput.value?.click()
}

function onImportFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      store.importJson(String(reader.result))
      importMessage.value = 'success'
    } catch {
      importMessage.value = 'error'
    }
  }
  reader.onerror = () => {
    importMessage.value = 'error'
  }
  reader.readAsText(file)
  // allow re-selecting the same file later
  event.target.value = ''
}
</script>

<template>
  <div class="screen admin-screen">
    <!-- Login gate -->
    <div v-if="!isLoggedIn" class="card login-card">
      <h1>{{ $t('admin.loginTitle') }}</h1>
      <p class="disclaimer">{{ $t('admin.disclaimer') }}</p>
      <form class="field" @submit.prevent="login">
        <label for="admin-password">{{ $t('admin.passwordLabel') }}</label>
        <input
          id="admin-password"
          v-model="passwordInput"
          type="password"
          :placeholder="$t('admin.passwordPlaceholder')"
          autocomplete="off"
        />
        <p v-if="loginError" class="error-text">{{ $t('admin.wrongPassword') }}</p>
        <button type="submit" class="btn">{{ $t('admin.loginButton') }}</button>
      </form>
    </div>

    <!-- Dashboard -->
    <div v-else class="dashboard">
      <div class="dashboard-header">
        <h1>{{ $t('admin.dashboardTitle') }}</h1>
        <button type="button" class="btn ghost" @click="logout">{{ $t('admin.logout') }}</button>
      </div>

      <div class="tab-bar">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'announcements' }"
          @click="activeTab = 'announcements'"
        >
          {{ $t('admin.announcementsTab') }}
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'events' }"
          @click="activeTab = 'events'"
        >
          {{ $t('admin.eventsTab') }}
        </button>
      </div>

      <template v-if="activeTab === 'announcements'">
      <div class="toolbar">
        <button type="button" class="btn" @click="startAdd">{{ $t('admin.addNew') }}</button>
        <button type="button" class="btn secondary" @click="exportData">
          {{ $t('admin.exportButton') }}
        </button>
        <button type="button" class="btn secondary" @click="triggerImport">
          {{ $t('admin.importButton') }}
        </button>
        <input
          ref="importFileInput"
          type="file"
          accept=".json"
          class="sr-only-input"
          @change="onImportFile"
        />
      </div>

      <p v-if="importMessage === 'success'" class="note note-success">
        {{ $t('admin.importSuccess') }}
      </p>
      <p v-else-if="importMessage === 'error'" class="note note-error">
        {{ $t('admin.importError') }}
      </p>
      <p v-if="savedNote" class="note note-success">{{ $t('admin.savedToBrowser') }}</p>

      <!-- Add / edit form -->
      <div v-if="showForm" class="card form-card">
        <div class="field">
          <label for="form-building">{{ $t('admin.buildingLabel') }}</label>
          <select id="form-building" v-model="form.buildingId">
            <option v-for="b in availableBuildings" :key="b.id" :value="b.id">{{ buildingOptionLabel(b) }}</option>
          </select>
        </div>

        <div class="field">
          <label for="form-type">{{ $t('admin.typeLabel') }}</label>
          <select id="form-type" v-model="form.type">
            <option v-for="t in ANNOUNCEMENT_TYPES" :key="t" :value="t">
              {{ $t(`announcementType.${t}`) }}
            </option>
          </select>
        </div>

        <div class="form-row">
          <div class="field">
            <label for="form-start">{{ $t('admin.startDateLabel') }}</label>
            <input id="form-start" v-model="form.startDate" type="date" />
          </div>
          <div class="field">
            <label for="form-end">{{ $t('admin.endDateLabel') }}</label>
            <input id="form-end" v-model="form.endDate" type="date" />
          </div>
        </div>

        <p v-if="formError" class="error-text">{{ $t('admin.formIncomplete') }}</p>

        <div class="form-actions">
          <button type="button" class="btn" @click="saveForm">{{ $t('admin.save') }}</button>
          <button type="button" class="btn ghost" @click="cancelForm">{{ $t('common.cancel') }}</button>
        </div>
      </div>

      <!-- Announcement list -->
      <p v-if="store.all.length === 0" class="note">{{ $t('admin.noAnnouncements') }}</p>
      <ul v-else class="announcement-list">
        <li v-for="a in store.all" :key="a.id" class="card announcement-card">
          <div class="announcement-top">
            <span class="building-name">{{ buildingName(a.buildingId) }}</span>
            <span class="pill" :class="`type-${a.type}`">{{ $t(`announcementType.${a.type}`) }}</span>
          </div>
          <p v-if="a.startDate || a.endDate" class="announcement-dates">
            {{ a.startDate || '?' }} — {{ a.endDate || '?' }}
          </p>
          <div class="announcement-actions">
            <button type="button" class="btn secondary" @click="startEdit(a)">
              {{ $t('admin.edit') }}
            </button>
            <button type="button" class="btn ghost" @click="deleteAnnouncement(a.id)">
              {{ $t('admin.delete') }}
            </button>
          </div>
        </li>
      </ul>
      </template>

      <!-- Events tab: powered by the Node.js + SQLite backend (server/). -->
      <template v-if="activeTab === 'events'">
      <p v-if="eventsLoadFailed" class="note note-error">{{ $t('admin.eventsServerUnreachable') }}</p>

      <div class="toolbar">
        <button type="button" class="btn" @click="startAddEvent">{{ $t('admin.addEvent') }}</button>
      </div>

      <p v-if="eventSavedNote" class="note note-success">{{ $t('admin.savedToServer') }}</p>

      <div v-if="showEventForm" class="card form-card">
        <div class="field">
          <label for="event-title">{{ $t('admin.eventTitleLabel') }}</label>
          <input id="event-title" v-model="eventForm.title" type="text" :placeholder="$t('admin.eventTitlePlaceholder')" />
        </div>

        <div class="field">
          <label for="event-type">{{ $t('admin.eventTypeLabel') }}</label>
          <select id="event-type" v-model="eventForm.type">
            <option v-for="t in EVENT_TYPES" :key="t" :value="t">{{ $t(`eventType.${t}`) }}</option>
          </select>
        </div>

        <div class="field">
          <label for="event-building">{{ $t('admin.eventBuildingLabel') }}</label>
          <select
            id="event-building"
            multiple
            class="multi-select"
            :size="Math.min(8, availableBuildings.length)"
            @change="onEventBuildingsChange"
          >
            <option
              v-for="b in availableBuildings"
              :key="b.id"
              :value="b.id"
              :selected="eventForm.buildingIds.includes(b.id)"
            >
              {{ buildingOptionLabel(b) }}
            </option>
          </select>
          <p class="field-hint">{{ $t('admin.eventBuildingHint') }}</p>
        </div>

        <div class="field">
          <label for="event-location-text">{{ $t('admin.eventLocationTextLabel') }}</label>
          <input
            id="event-location-text"
            v-model="eventForm.locationText"
            type="text"
            :placeholder="$t('admin.eventLocationTextPlaceholder')"
          />
        </div>

        <div class="form-row">
          <div class="field">
            <label for="event-start">{{ $t('admin.eventStartLabel') }}</label>
            <input id="event-start" v-model="eventForm.startDate" type="datetime-local" />
          </div>
          <div class="field">
            <label for="event-end">{{ $t('admin.eventEndLabel') }}</label>
            <input id="event-end" v-model="eventForm.endDate" type="datetime-local" />
          </div>
        </div>

        <div class="field">
          <label for="event-description">{{ $t('admin.eventDescriptionLabel') }}</label>
          <textarea id="event-description" v-model="eventForm.description" rows="2"></textarea>
        </div>

        <p v-if="eventFormError === 'incomplete'" class="error-text">{{ $t('admin.formIncomplete') }}</p>
        <p v-else-if="eventFormError === 'dateOrder'" class="error-text">{{ $t('admin.eventDateOrderError') }}</p>
        <p v-else-if="eventFormError === 'serverUnreachable'" class="error-text">{{ $t('admin.eventsServerUnreachable') }}</p>

        <div class="form-actions">
          <button type="button" class="btn" @click="saveEventForm">{{ $t('admin.save') }}</button>
          <button type="button" class="btn ghost" @click="cancelEventForm">{{ $t('common.cancel') }}</button>
        </div>
      </div>

      <p v-if="!eventsLoadFailed && events.length === 0" class="note">{{ $t('admin.noEvents') }}</p>
      <ul v-else class="announcement-list">
        <li v-for="ev in events" :key="ev.id" class="card announcement-card">
          <div class="announcement-top">
            <span class="building-name">{{ ev.title }}</span>
            <span class="pill">{{ $t(`eventType.${ev.type}`) }}</span>
          </div>
          <p class="announcement-area">
            {{ eventBuildingNames(ev) || '—' }}<span v-if="ev.location_text"> · {{ ev.location_text }}</span>
          </p>
          <p v-if="ev.description" class="announcement-message">{{ ev.description }}</p>
          <p class="announcement-dates">{{ formatEventDateTime(ev.start_date) }} — {{ formatEventDateTime(ev.end_date) }}</p>
          <p class="announcement-dates">{{ $t('admin.eventPublishedLabel', { time: formatEventDateTime(ev.created_at) }) }}</p>
          <div class="announcement-actions">
            <button type="button" class="btn secondary" @click="startEditEvent(ev)">
              {{ $t('admin.edit') }}
            </button>
            <button type="button" class="btn ghost" @click="deleteEventItem(ev.id)">
              {{ $t('admin.delete') }}
            </button>
          </div>
        </li>
      </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.admin-screen {
  align-items: stretch;
  max-width: 760px;
}

.login-card {
  max-width: 420px;
  margin: 2rem auto;
  text-align: left;
}

.disclaimer {
  background: rgba(212, 169, 79, 0.15);
  border: 1.5px solid var(--fcu-gold);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  color: var(--text);
  font-size: 0.92rem;
  margin: 0.75rem 0 1.25rem;
}

.error-text {
  color: var(--fcu-maroon);
  font-weight: 600;
  font-size: 0.9rem;
  margin: 0;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.toolbar {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin: 1rem 0;
}

.sr-only-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.note {
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  font-size: 0.92rem;
  margin: 0.5rem 0;
}
.note-success {
  background: rgba(0, 107, 147, 0.1);
  color: var(--fcu-blue-dark);
}
.note-error {
  background: rgba(129, 27, 41, 0.1);
  color: var(--fcu-maroon-dark);
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.form-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.form-row .field {
  flex: 1 1 160px;
}

.multi-select {
  min-height: 120px;
}

.field-hint {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.form-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.announcement-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.announcement-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.announcement-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.building-name {
  font-weight: 700;
  color: var(--fcu-maroon-dark);
}

.pill {
  background: rgba(0, 107, 147, 0.12);
  color: var(--fcu-blue-dark);
}

.announcement-area {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
}

.announcement-message {
  margin: 0;
}

.announcement-dates {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}

.required-mark {
  color: var(--fcu-maroon);
}

.announcement-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.4rem;
  flex-wrap: wrap;
}

@media (max-width: 480px) {
  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .toolbar .btn {
    flex: 1 1 auto;
  }
}
</style>
