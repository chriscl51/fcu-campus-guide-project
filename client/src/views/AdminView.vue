<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAnnouncementsStore } from '../stores/announcements'
import {
  fetchAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  login as apiLogin,
  logout as apiLogout,
  fetchMe,
  changePassword as apiChangePassword,
  fetchAdmins,
  createAdmin,
  deleteAdmin,
} from '../utils/api'
import buildings from '../data/buildings.json'
import { buildingOptionLabel, selectableBuildings } from '../utils/buildingOptions'
import { formatWallClock, formatTaipeiInstant } from '../utils/dateFormat'

// Real account-based auth (see server/auth.js + server/index.js's
// /api/auth/* routes): logging in exchanges a username/password for a
// session token, kept in sessionStorage and sent back as
// "Authorization: Bearer <token>" on every write request. There is no
// front-end-only password anymore — the login screen genuinely needs the
// backend (server/) running to work.
const SESSION_KEY = 'fcu-guide-admin'

const ANNOUNCEMENT_TYPES = ['renovation', 'restroom', 'elevator', 'water', 'power', 'maintenance', 'other']
const availableBuildings = selectableBuildings(buildings)

const store = useAnnouncementsStore()

const token = ref('')
const username = ref('')
const isLoggedIn = computed(() => !!token.value)

const loginUsername = ref('')
const loginPassword = ref('')
const loginError = ref('') // '', 'invalid', 'serverUnreachable'

const showForm = ref(false)
const editingId = ref(null)
const savedNote = ref(false)
let savedNoteTimer = null

const emptyForm = () => ({
  buildingId: availableBuildings[0]?.id || '',
  type: ANNOUNCEMENT_TYPES[0],
  area: '',
  message: '',
  startDate: '',
  endDate: '',
})

const form = reactive(emptyForm())
const formError = ref('') // '', 'incomplete', 'serverUnreachable'

// ---- account management: change my password, add/remove other admins ---
const admins = ref([])
const adminsLoadFailed = ref(false)

async function loadAdmins() {
  const result = await fetchAdmins(token.value)
  if (result.ok) {
    admins.value = result.data
    adminsLoadFailed.value = false
  } else {
    adminsLoadFailed.value = true
  }
}

const changePasswordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const changePasswordError = ref('') // '', 'tooShort', 'mismatch', 'wrongCurrent', 'serverUnreachable'
const changePasswordSuccess = ref(false)

async function submitChangePassword() {
  changePasswordError.value = ''
  changePasswordSuccess.value = false
  if (changePasswordForm.newPassword.length < 8) {
    changePasswordError.value = 'tooShort'
    return
  }
  if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
    changePasswordError.value = 'mismatch'
    return
  }
  const result = await apiChangePassword(
    token.value,
    changePasswordForm.currentPassword,
    changePasswordForm.newPassword
  )
  if (result.ok) {
    changePasswordSuccess.value = true
    changePasswordForm.currentPassword = ''
    changePasswordForm.newPassword = ''
    changePasswordForm.confirmPassword = ''
  } else if (result.status === 0) {
    changePasswordError.value = 'serverUnreachable'
  } else {
    changePasswordError.value = 'wrongCurrent'
  }
}

const newAdminForm = reactive({ username: '', password: '' })
const addAdminError = ref('') // '', 'invalid', 'taken', 'serverUnreachable', 'other'

async function submitAddAdmin() {
  addAdminError.value = ''
  if (!newAdminForm.username.trim() || newAdminForm.password.length < 8) {
    addAdminError.value = 'invalid'
    return
  }
  const result = await createAdmin(token.value, newAdminForm.username.trim(), newAdminForm.password)
  if (result.ok) {
    newAdminForm.username = ''
    newAdminForm.password = ''
    await loadAdmins()
  } else if (result.status === 409) {
    addAdminError.value = 'taken'
  } else if (result.status === 0) {
    addAdminError.value = 'serverUnreachable'
  } else {
    addAdminError.value = 'other'
  }
}

const removeAdminError = ref('') // '', 'lastAdmin', 'other'

async function removeAdmin(id) {
  removeAdminError.value = ''
  const result = await deleteAdmin(token.value, id)
  if (result.ok) {
    await loadAdmins()
  } else if (result.status === 400) {
    removeAdminError.value = 'lastAdmin'
  } else {
    removeAdminError.value = 'other'
  }
}

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
const activeTab = ref('announcements') // 'announcements' | 'events' | 'account'
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
    ? await updateEvent(editingEventId.value, payload, token.value)
    : await createEvent(payload, token.value)

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
  const ok = await deleteEvent(id, token.value)
  if (ok) {
    flashEventSavedNote()
    await loadEvents()
  }
}

async function afterLogin() {
  await Promise.all([store.load(), loadEvents(), loadAdmins()])
}

onMounted(async () => {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (raw) {
    try {
      const saved = JSON.parse(raw)
      token.value = saved.token || ''
      username.value = saved.username || ''
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }

  if (token.value) {
    const result = await fetchMe(token.value)
    if (result.ok) {
      username.value = result.data.username
    } else if (result.status !== 0) {
      // Server reachable and said the token is invalid/expired — really logged out.
      token.value = ''
      username.value = ''
      sessionStorage.removeItem(SESSION_KEY)
    }
    // status === 0 (server unreachable): keep the cached session optimistically,
    // write actions will just fail until the server comes back.
  }

  if (token.value) await afterLogin()
})

async function login() {
  loginError.value = ''
  const result = await apiLogin(loginUsername.value.trim(), loginPassword.value)
  if (result.ok) {
    token.value = result.data.token
    username.value = result.data.username
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: token.value, username: username.value }))
    loginPassword.value = ''
    await afterLogin()
  } else if (result.status === 0) {
    loginError.value = 'serverUnreachable'
  } else {
    loginError.value = 'invalid'
  }
}

async function logout() {
  if (token.value) await apiLogout(token.value)
  token.value = ''
  username.value = ''
  sessionStorage.removeItem(SESSION_KEY)
  showForm.value = false
}

function startAdd() {
  editingId.value = null
  Object.assign(form, emptyForm())
  formError.value = ''
  showForm.value = true
}

function startEdit(announcement) {
  editingId.value = announcement.id
  Object.assign(form, {
    buildingId: announcement.buildingId,
    type: announcement.type,
    area: announcement.area || '',
    message: announcement.message || '',
    startDate: announcement.startDate || '',
    endDate: announcement.endDate || '',
  })
  formError.value = ''
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  editingId.value = null
  formError.value = ''
}

function flashSavedNote() {
  savedNote.value = true
  if (savedNoteTimer) clearTimeout(savedNoteTimer)
  savedNoteTimer = setTimeout(() => {
    savedNote.value = false
  }, 3000)
}

async function saveForm() {
  if (!form.buildingId || !form.message.trim()) {
    formError.value = 'incomplete'
    return
  }
  formError.value = ''

  const payload = {
    buildingId: form.buildingId,
    type: form.type,
    area: form.area.trim(),
    message: form.message.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
  }

  const result = editingId.value
    ? await store.update(editingId.value, payload, token.value)
    : await store.add(payload, token.value)

  if (!result) {
    formError.value = 'serverUnreachable'
    return
  }

  showForm.value = false
  editingId.value = null
  flashSavedNote()
}

async function deleteAnnouncement(id) {
  const ok = await store.remove(id, token.value)
  if (ok) flashSavedNote()
}
</script>

<template>
  <div class="screen admin-screen">
    <!-- Login gate -->
    <div v-if="!isLoggedIn" class="card login-card">
      <h1>{{ $t('admin.loginTitle') }}</h1>
      <p class="disclaimer">{{ $t('admin.disclaimer') }}</p>
      <form class="field" @submit.prevent="login">
        <label for="admin-username">{{ $t('admin.usernameLabel') }}</label>
        <input
          id="admin-username"
          v-model="loginUsername"
          type="text"
          :placeholder="$t('admin.usernamePlaceholder')"
          autocomplete="username"
        />
        <label for="admin-password">{{ $t('admin.passwordLabel') }}</label>
        <input
          id="admin-password"
          v-model="loginPassword"
          type="password"
          :placeholder="$t('admin.passwordPlaceholder')"
          autocomplete="current-password"
        />
        <p v-if="loginError === 'invalid'" class="error-text">{{ $t('admin.wrongCredentials') }}</p>
        <p v-else-if="loginError === 'serverUnreachable'" class="error-text">
          {{ $t('admin.eventsServerUnreachable') }}
        </p>
        <button type="submit" class="btn">{{ $t('admin.loginButton') }}</button>
      </form>
    </div>

    <!-- Dashboard -->
    <div v-else class="dashboard">
      <div class="dashboard-header">
        <h1>{{ $t('admin.dashboardTitle') }}</h1>
        <div class="header-right">
          <span class="logged-in-as">{{ $t('admin.loggedInAs', { username }) }}</span>
          <button type="button" class="btn ghost" @click="logout">{{ $t('admin.logout') }}</button>
        </div>
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
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'account' }"
          @click="activeTab = 'account'"
        >
          {{ $t('admin.accountTab') }}
        </button>
      </div>

      <template v-if="activeTab === 'announcements'">
      <div class="toolbar">
        <button type="button" class="btn" @click="startAdd">{{ $t('admin.addNew') }}</button>
      </div>

      <p v-if="savedNote" class="note note-success">{{ $t('admin.savedToServer') }}</p>

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

        <div class="field">
          <label for="form-area">{{ $t('admin.areaLabel') }}</label>
          <input id="form-area" v-model="form.area" type="text" :placeholder="$t('admin.areaPlaceholder')" />
        </div>

        <div class="field">
          <label for="form-message">{{ $t('admin.messageLabel') }}</label>
          <textarea
            id="form-message"
            v-model="form.message"
            rows="2"
            :placeholder="$t('admin.messagePlaceholder')"
          ></textarea>
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

        <p v-if="formError === 'incomplete'" class="error-text">{{ $t('admin.formIncomplete') }}</p>
        <p v-else-if="formError === 'serverUnreachable'" class="error-text">
          {{ $t('admin.eventsServerUnreachable') }}
        </p>

        <div class="form-actions">
          <button type="button" class="btn" @click="saveForm">{{ $t('admin.save') }}</button>
          <button type="button" class="btn ghost" @click="cancelForm">{{ $t('common.cancel') }}</button>
        </div>
      </div>

      <!-- Announcement list -->
      <p v-if="store.loadFailed" class="note note-error">{{ $t('admin.eventsServerUnreachable') }}</p>
      <p v-else-if="store.all.length === 0" class="note">{{ $t('admin.noAnnouncements') }}</p>
      <ul v-else class="announcement-list">
        <li v-for="a in store.all" :key="a.id" class="card announcement-card">
          <div class="announcement-top">
            <span class="building-name">{{ buildingName(a.buildingId) }}</span>
            <span class="pill" :class="`type-${a.type}`">{{ $t(`announcementType.${a.type}`) }}</span>
          </div>
          <p v-if="a.area" class="announcement-area">{{ a.area }}</p>
          <p class="announcement-message">{{ a.message }}</p>
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

      <!-- Account tab: change my password, add/remove admins. -->
      <template v-if="activeTab === 'account'">
      <div class="card form-card">
        <h2 class="section-title">{{ $t('admin.changePasswordTitle') }}</h2>
        <form @submit.prevent="submitChangePassword">
          <div class="field">
            <label for="current-password">{{ $t('admin.currentPasswordLabel') }}</label>
            <input
              id="current-password"
              v-model="changePasswordForm.currentPassword"
              type="password"
              autocomplete="current-password"
            />
          </div>
          <div class="field">
            <label for="new-password">{{ $t('admin.newPasswordLabel') }}</label>
            <input
              id="new-password"
              v-model="changePasswordForm.newPassword"
              type="password"
              autocomplete="new-password"
            />
          </div>
          <div class="field">
            <label for="confirm-password">{{ $t('admin.confirmPasswordLabel') }}</label>
            <input
              id="confirm-password"
              v-model="changePasswordForm.confirmPassword"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <p v-if="changePasswordError === 'tooShort'" class="error-text">{{ $t('admin.passwordTooShort') }}</p>
          <p v-else-if="changePasswordError === 'mismatch'" class="error-text">{{ $t('admin.passwordMismatch') }}</p>
          <p v-else-if="changePasswordError === 'wrongCurrent'" class="error-text">{{ $t('admin.currentPasswordWrong') }}</p>
          <p v-else-if="changePasswordError === 'serverUnreachable'" class="error-text">{{ $t('admin.eventsServerUnreachable') }}</p>
          <p v-if="changePasswordSuccess" class="note note-success">{{ $t('admin.changePasswordSuccess') }}</p>

          <div class="form-actions">
            <button type="submit" class="btn">{{ $t('admin.changePasswordButton') }}</button>
          </div>
        </form>
      </div>

      <div class="card form-card">
        <h2 class="section-title">{{ $t('admin.adminsListTitle') }}</h2>
        <p v-if="adminsLoadFailed" class="note note-error">{{ $t('admin.eventsServerUnreachable') }}</p>
        <ul v-else class="admin-list">
          <li v-for="a in admins" :key="a.id" class="admin-row">
            <span>{{ a.username }}</span>
            <button
              type="button"
              class="btn ghost"
              :disabled="admins.length <= 1"
              @click="removeAdmin(a.id)"
            >
              {{ $t('admin.removeAdmin') }}
            </button>
          </li>
        </ul>
        <p v-if="removeAdminError === 'lastAdmin'" class="error-text">{{ $t('admin.cannotRemoveLast') }}</p>

        <h3 class="section-title">{{ $t('admin.addAdminTitle') }}</h3>
        <form @submit.prevent="submitAddAdmin">
          <div class="field">
            <label for="new-admin-username">{{ $t('admin.newAdminUsernameLabel') }}</label>
            <input id="new-admin-username" v-model="newAdminForm.username" type="text" autocomplete="off" />
          </div>
          <div class="field">
            <label for="new-admin-password">{{ $t('admin.newAdminPasswordLabel') }}</label>
            <input
              id="new-admin-password"
              v-model="newAdminForm.password"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <p v-if="addAdminError === 'invalid'" class="error-text">{{ $t('admin.newAdminInvalid') }}</p>
          <p v-else-if="addAdminError === 'taken'" class="error-text">{{ $t('admin.adminUsernameTaken') }}</p>
          <p v-else-if="addAdminError === 'serverUnreachable'" class="error-text">{{ $t('admin.eventsServerUnreachable') }}</p>

          <div class="form-actions">
            <button type="submit" class="btn">{{ $t('admin.addAdminButton') }}</button>
          </div>
        </form>
      </div>
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

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.logged-in-as {
  font-size: 0.88rem;
  color: var(--text-muted);
}

.section-title {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}

.admin-list {
  list-style: none;
  margin: 0 0 1.25rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.admin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  background: rgba(0, 107, 147, 0.06);
}

.toolbar {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin: 1rem 0;
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
