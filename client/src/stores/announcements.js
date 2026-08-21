import { defineStore } from 'pinia'

// Admin announcements ("這棟大樓的這個區域在整修/廁所故障/停水停電...") — this is a
// pure front-end site with no backend database, so persistence works two ways
// at once (per the project brief, "兩者都做"):
//   1. localStorage — whatever the admin saves shows up immediately in *this*
//      browser, survives reloads, but doesn't reach anyone else's browser.
//   2. Export/Import JSON — the admin can download announcements.json and
//      commit it to public/data/announcements.json before redeploying, so a
//      freshly-loaded site (any browser) shows the same shipped announcements
//      as its baseline. localStorage edits always layer on top of that baseline.
const STORAGE_KEY = 'fcu-guide-announcements-v1'
const BASELINE_URL = `${import.meta.env.BASE_URL}data/announcements.json`

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocal(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // localStorage unavailable (private mode / storage full) — the session
    // still works, edits just won't survive a reload. Not fatal.
  }
}

let uidCounter = 0
function makeId() {
  uidCounter += 1
  return `local-${Date.now()}-${uidCounter}`
}

export const useAnnouncementsStore = defineStore('announcements', {
  state: () => ({
    baseline: [], // shipped in public/data/announcements.json, loaded once at startup
    local: loadLocal(), // this browser's admin edits
    loaded: false,
  }),
  getters: {
    /** Merged, de-duplicated (local edits win over a baseline entry with the
     * same id) list of every active announcement. */
    all(state) {
      const byId = new Map()
      for (const a of state.baseline) byId.set(a.id, a)
      for (const a of state.local) byId.set(a.id, a)
      return [...byId.values()].filter((a) => !a.deleted)
    },
    forBuilding(state) {
      return (buildingId) => this.all.filter((a) => a.buildingId === buildingId)
    },
  },
  actions: {
    async loadBaseline() {
      if (this.loaded) return
      this.loaded = true
      try {
        const res = await fetch(BASELINE_URL)
        if (res.ok) this.baseline = await res.json()
      } catch {
        // no baseline file shipped yet / offline first run — fine, just start empty
      }
    },
    add(announcement) {
      const entry = {
        id: makeId(),
        buildingId: announcement.buildingId,
        area: announcement.area || '',
        type: announcement.type, // 'renovation' | 'restroom' | 'elevator' | 'water' | 'power' | 'other'
        message: announcement.message,
        startDate: announcement.startDate || '',
        endDate: announcement.endDate || '',
        createdAt: new Date().toISOString(),
      }
      this.local = [...this.local, entry]
      saveLocal(this.local)
      return entry
    },
    update(id, patch) {
      this.local = this.local.map((a) => (a.id === id ? { ...a, ...patch } : a))
      // if it was a baseline-only entry being edited for the first time, add
      // a local override copy so the merge picks it up
      if (!this.local.some((a) => a.id === id)) {
        const base = this.baseline.find((a) => a.id === id)
        if (base) this.local = [...this.local, { ...base, ...patch }]
      }
      saveLocal(this.local)
    },
    remove(id) {
      if (this.baseline.some((a) => a.id === id)) {
        // mark a baseline entry as deleted via a local override
        const base = this.baseline.find((a) => a.id === id)
        this.local = [...this.local.filter((a) => a.id !== id), { ...base, deleted: true }]
      } else {
        this.local = this.local.filter((a) => a.id !== id)
      }
      saveLocal(this.local)
    },
    exportJson() {
      return JSON.stringify(this.all, null, 2)
    },
    importJson(text) {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of announcements')
      this.local = parsed
      saveLocal(this.local)
    },
  },
})
