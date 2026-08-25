import { defineStore } from 'pinia'
import buildings from '../data/buildings.json'
import gates from '../data/gates.json'
import { nearestParkingTo, parkingLots } from '../utils/parking.js'

// Origins can be a building, a campus gate, or one of the two curated
// parking lots — this looks up any of the three by id.
function findOrigin(id) {
  return (
    buildings.find((b) => b.id === id) ||
    gates.find((g) => g.id === id) ||
    parkingLots.find((p) => p.id === id) ||
    null
  )
}

// "Origin" options include every building/gate PLUS this synthetic option,
// which triggers the "help me find parking first" flow (driving mode).
export const DRIVE_MODE_ORIGIN = '__drive_find_parking__'

export const STEP = {
  INTRO: 'intro',
  SELECT: 'select',
  NAVIGATION: 'navigation', // new: Google Maps navigation (driving or walking)
}

export const useAppStore = defineStore('app', {
  state: () => ({
    step: STEP.INTRO,
    originId: null, // building id, gate id, or DRIVE_MODE_ORIGIN
    destinationId: null,
    navigationMode: null, // 'walking' | 'driving' | null
    facilitiesOpen: false, // whether the FacilityPanel overlay is showing
  }),
  getters: {
    buildingsById: () => Object.fromEntries(buildings.map((b) => [b.id, b])),
    destinationBuilding(state) {
      const building = buildings.find((b) => b.id === state.destinationId)
      if (building) return building
      const gate = gates.find((g) => g.id === state.destinationId)
      if (gate) return gate
      return null
    },
    originBuilding(state) {
      return findOrigin(state.originId)
    },
    // Feedback item: gates have no facilities/photo worth showing on arrival
    // (unlike a building), so the arrival popup is skipped for them entirely.
    destinationIsGate(state) {
      return gates.some((g) => g.id === state.destinationId)
    },
    suggestedParking(state) {
      const dest = this.destinationBuilding
      if (!dest) return null
      return nearestParkingTo(dest.lat, dest.lon)
    },
  },
  actions: {
    reset() {
      this.step = STEP.INTRO
      this.originId = null
      this.destinationId = null
      this.navigationMode = null
      this.facilitiesOpen = false
    },
    setDestination(id) {
      this.destinationId = id
    },
    setOrigin(id) {
      this.originId = id
    },
    /** Start navigation: determine mode from originId and transition to NAVIGATION step. */
    startNavigation() {
      if (this.originId === DRIVE_MODE_ORIGIN) {
        this.navigationMode = 'driving'
      } else {
        this.navigationMode = 'walking'
      }
      this.step = STEP.NAVIGATION
    },
  },
})
