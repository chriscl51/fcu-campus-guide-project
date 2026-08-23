import { defineStore } from 'pinia'
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../utils/api'
import { isWithinWindow } from '../utils/activeWindow'

// Building change notices ("這棟大樓的這個區域在整修/廁所故障/停水停電...").
// Backed by the Node.js + SQLite server (server/) — same shared-data model as
// events, so every admin sees and edits the same list. If the server isn't
// running, `all` just stays empty (see App.vue's use of `load()` /
// `loadFailed`), matching how the rest of the site degrades gracefully
// without the backend.
export const useAnnouncementsStore = defineStore('announcements', {
  state: () => ({
    items: [],
    loaded: false,
    loadFailed: false,
  }),
  getters: {
    all(state) {
      return state.items
    },
    // Unfiltered by date — kept for the admin panel, which needs to manage
    // the full history (past and future), not just what's currently live.
    forBuilding(state) {
      return (buildingId) => state.items.filter((a) => a.buildingId === buildingId)
    },
    // Announcements whose optional startDate/endDate window currently covers
    // today (Asia/Taipei) — an announcement "上架" (publishes) 24 hours before
    // startDate and "下架" (unpublishes) 24 hours after endDate, same rule as
    // events (see utils/activeWindow.js). Used everywhere a visitor sees
    // announcements — the landing page board and FacilityPanel.vue's
    // per-building list both use this, so a notice appears/disappears on the
    // same schedule no matter where it's shown.
    activeNow(state) {
      return state.items.filter((a) => isWithinWindow(a.startDate, a.endDate))
    },
    activeForBuilding() {
      return (buildingId) => this.activeNow.filter((a) => a.buildingId === buildingId)
    },
  },
  actions: {
    async load() {
      const rows = await fetchAnnouncements()
      this.loaded = true
      if (rows) {
        this.items = rows
        this.loadFailed = false
      } else {
        this.loadFailed = true
      }
    },
    async add(announcement, token) {
      const created = await createAnnouncement(announcement, token)
      if (created) await this.load()
      return created
    },
    async update(id, patch, token) {
      const updated = await updateAnnouncement(id, patch, token)
      if (updated) await this.load()
      return updated
    },
    async remove(id, token) {
      const ok = await deleteAnnouncement(id, token)
      if (ok) await this.load()
      return ok
    },
  },
})
