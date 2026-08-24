import { defineStore } from 'pinia'
import buildings from '../data/buildings.json'
import gates from '../data/gates.json'
import { nearestNode, shortestPath, estimateWalkMinutes, buildDirections } from '../utils/routing'
import { nearestParkingTo, parkingLots } from '../utils/parking'

// Origins can be a building, a campus gate, or one of the two curated
// parking lots (see utils/parking.js) — this looks up any of the three by id.
function findOrigin(id) {
  return (
    buildings.find((b) => b.id === id) ||
    gates.find((g) => g.id === id) ||
    parkingLots.find((p) => p.id === id) ||
    null
  )
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
    // Destination is usually a building, but can also be one of the two
    // curated parking lots (see utils/parking.js) — e.g. walking back to
    // your car. Parking lots have no surveyed `entranceNode` of their own
    // (unlike buildings), so one is resolved on the fly via nearestNode(),
    // the same lookup startDriving() already uses for the walking start.
    destinationBuilding(state) {
      const building = buildings.find((b) => b.id === state.destinationId)
      if (building) return building
      const gate = gates.find((g) => g.id === state.destinationId)
      if (gate) return gate
      const lot = parkingLots.find((p) => p.id === state.destinationId)
      if (lot) return { ...lot, entranceNode: nearestNode(lot.lat, lot.lon) }
      return null
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
      this.chosenParkingLotId = lot.nameZh
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
      // If starting from a gate with a known facingBearing (see data/gates.json),
      // seed buildDirections with it so a turn immediately outside the gate
      // (before the route reaches its own second surveyed node) is still
      // described — see buildDirections' initialBearing doc comment.
      const initialBearing = this.originBuilding?.facingBearing ?? null
      this.route = {
        points: path.points,
        distanceMeters: Math.round(path.distanceMeters),
        etaMinutes: estimateWalkMinutes(path.distanceMeters),
        steps: buildDirections(path.points, initialBearing),
      }
      this.step = STEP.ROUTING
      return true
    },
    arrive() {
      this.step = STEP.ARRIVED
    },
  },
})
