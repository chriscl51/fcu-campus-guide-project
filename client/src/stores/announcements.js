import { defineStore } from 'pinia'
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../utils/api'

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
    forBuilding(state) {
      return (buildingId) => state.items.filter((a) => a.buildingId === buildingId)
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
