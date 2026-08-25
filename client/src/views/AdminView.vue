<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
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
import { formatWallClock } from '../utils/dateFormat'

const SESSION_KEY = 'fcu-guide-admin'

const EVENT_TYPES = ['exam', 'lecture', 'symposium', 'other']
const availableBuildings = selectableBuildings(buildings)

const token = ref('')
const username = ref('')
const isLoggedIn = computed(() => Boolean(token.value))

const loginUsername = ref('')
const loginPassword = ref('')
const loginError = ref('') // '', 'invalid', 'serverUnreachable'

const activeTab = ref('events') // 'events' | 'account'

// ---- Events management (活動通報) --------------------------------------
const events = ref([])
const eventsLoadFailed = ref(false)
const showEventForm = ref(false)
const editingEventId = ref(null)
const eventFormError = ref('')
const eventSavedNote = ref(false)
let eventSavedNoteTimer = null

const emptyEventForm = () => ({
  title: '',
  type: EVENT_TYPES[0],
  buildingIds: [],
  locationText: '',
  description: '',
  startDate: '',
  endDate: '',
})

const eventForm = reactive(emptyEventForm())

function onEventBuildingsChange(e) {
  eventForm.buildingIds = Array.from(e.target.selectedOptions).map((o) => o.value)
}

function eventBuildingNames(ev) {
  return (ev.locations || [])
    .map((loc) => (loc.officialCode ? `${loc.officialCode}｜${loc.nameZh}` : loc.nameZh))
    .join('、')
}

function formatEventDateTime(value) {
  return formatWallClock(value, 'zh-TW')
}

async function loadEvents() {
  const result = await fetchAllEvents()
  if (result) {
    events.value = result
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
    description: ev.description || '',
    startDate: ev.start_date || '',
    endDate: ev.end_date || '',
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
    location_text: eventForm.locationText.trim(),
    description: eventForm.description.trim(),
    start_date: eventForm.startDate,
    end_date: eventForm.endDate,
  }

  const result = editingEventId.value
    ? await updateEvent(editingEventId.value, payload, token.value)
    : await createEvent(payload, token.value)

  if (!result.ok) {
    eventFormError.value = 'serverUnreachable'
    return
  }

  showEventForm.value = false
  editingEventId.value = null
  await loadEvents()
  flashEventSavedNote()
}

async function deleteEventItem(id) {
  const result = await deleteEvent(id, token.value)
  if (result.ok) {
    await loadEvents()
    flashEventSavedNote()
  }
}

// ---- Account management ------------------------------------------------
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
const changePasswordError = ref('')
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
const addAdminError = ref('')

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

const removeAdminError = ref('')

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

async function afterLogin() {
  await loadEvents()
  await loadAdmins()
}

onMounted(async () => {
  const cached = sessionStorage.getItem(SESSION_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (parsed?.token) {
        token.value = parsed.token
        username.value = parsed.username || ''
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }

  if (token.value) {
    const result = await fetchMe(token.value)
    if (result.ok) {
      username.value = result.data.username
    } else if (result.status !== 0) {
      token.value = ''
      username.value = ''
      sessionStorage.removeItem(SESSION_KEY)
    }
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
  showEventForm.value = false
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

      <!-- Events tab (活動通報管理) -->
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
        <ul v-else class="event-list">
          <li v-for="ev in events" :key="ev.id" class="card event-card">
            <div class="event-top">
              <span class="event-name">{{ ev.title }}</span>
              <span class="pill">{{ $t(`eventType.${ev.type}`) }}</span>
            </div>
            <p class="event-area">
              📍 {{ eventBuildingNames(ev) || '—' }}<span v-if="ev.location_text"> · {{ ev.location_text }}</span>
            </p>
            <p v-if="ev.description" class="event-message">{{ ev.description }}</p>
            <p class="event-dates">{{ formatEventDateTime(ev.start_date) }} — {{ formatEventDateTime(ev.end_date) }}</p>
            <div class="event-actions">
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

      <!-- Account tab -->
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

.tab-bar {
  display: flex;
  gap: 0.5rem;
  margin: 1.25rem 0 1rem;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0.5rem;
}

.tab-btn {
  padding: 0.5rem 1.2rem;
  border: none;
  background: transparent;
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text);
}
.tab-btn.active {
  background: var(--fcu-maroon);
  color: #fff;
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

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.event-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.event-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.event-name {
  font-weight: 700;
  color: var(--fcu-maroon-dark);
}

.pill {
  background: rgba(0, 107, 147, 0.12);
  color: var(--fcu-blue-dark);
}

.event-area {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
}

.event-message {
  margin: 0;
}

.event-dates {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}

.event-actions {
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
