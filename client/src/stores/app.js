import { defineStore } from 'pinia'
import buildings from '../data/buildings.json'
import gates from '../data/gates.json'
import { nearestNode, shortestPath, estimateWalkMinutes, buildDirections } from '../utils/routing'
import { nearestParkingTo } from '../utils/parking'

// Origins can be a building OR a campus gate — this looks up either by id.
function findOrigin(id) {
  return buildings.find((b) => b.id === id) || gates.find((g) => g.id === id) || null
}

// "Origin" options include every building/gate PLUS this synthetic option,
// which triggers the "help me find parking first" flow (spec item 1.b / 2.b).
export const DRIVE_MODE_ORIGIN = '__drive_find_parking__'

export const STEP = {
  INTRO: 'intro',
  SELECT: 'select',
  ROUTING: 'routing',
  ARRIVED: 'arrived',
}

export const useAppStore = defineStore('app', {
  state: () => ({
    step: STEP.INTRO,
    originId: null, // building id, or DRIVE_MODE_ORIGIN
    destinationId: null,
    chosenParkingLotId: null, // set once the user confirms which lot they're parking/starting from
    route: null, // { points, distanceMeters, steps, etaMinutes }
    facilitiesOpen: false, // whether the FacilityPanel overlay is showing (after arrival)
  }),
  getters: {
    buildingsById: () => Object.fromEntries(buildings.map((b) => [b.id, b])),
    destinationBuilding(state) {
      return buildings.find((b) => b.id === state.destinationId) || null
    },
    originBuilding(state) {
      return findOrigin(state.originId)
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
      this.chosenParkingLotId = null
      this.route = null
      this.facilitiesOpen = false
    },
    setDestination(id) {
      this.destinationId = id
    },
    setOrigin(id) {
      this.originId = id
    },
    /** Feedback item: driving users no longer manually pick a parking lot —
     * after they choose their destination in the dropdown, the nearest lot
     * is determined automatically and the screen jumps straight to the
     * walking route (deer walks from the lot's nearest campus entrance to
     * the destination). Returns false if no destination/lot could be
     * resolved so the caller can no-op instead of navigating nowhere. */
    startDriving() {
      const lot = this.suggestedParking
      if (!lot) return false
      this.chosenParkingLotId = lot.name
      return this.computeRoute(lot.lat, lot.lon)
    },
    /** Compute the Dijkstra route from an explicit lat/lon start (a building
     * entrance, or a chosen parking lot) to the selected destination building. */
    computeRoute(startLat, startLon) {
      const dest = this.destinationBuilding
      if (!dest) return false
      const startNode = nearestNode(startLat, startLon)
      const path = shortestPath(startNode, dest.entranceNode)
      if (!path) return false
      this.route = {
        points: path.points,
        distanceMeters: Math.round(path.distanceMeters),
        etaMinutes: estimateWalkMinutes(path.distanceMeters),
        steps: buildDirections(path.points),
      }
      this.step = STEP.ROUTING
      return true
    },
    arrive() {
      this.step = STEP.ARRIVED
    },
  },
})
