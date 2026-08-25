// Dijkstra shortest-path routing over the real campus walking-path graph
// (src/data/graph.json, built from the user's JOSM survey — see scripts/).
import graph from '../data/graph.json'
import { haversine } from './projection'

const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
const adjacency = new Map()
for (const n of graph.nodes) adjacency.set(n.id, [])
for (const e of graph.edges) {
  adjacency.get(e.a)?.push({ to: e.b, d: e.d })
  adjacency.get(e.b)?.push({ to: e.a, d: e.d })
}

/** Find the graph node nearest a given lat/lon (used to snap a building's
 * entrance coordinate onto the routable network). */
export function nearestNode(lat, lon) {
  let best = null
  let bestD = Infinity
  for (const n of graph.nodes) {
    const d = haversine({ lat, lon }, n)
    if (d < bestD) {
      bestD = d
      best = n.id
    }
  }
  return best
}

/** Classic array-based Dijkstra — the graph has ~1k nodes so an O(V^2) scan
 * is plenty fast and keeps the implementation simple/obviously-correct. */
export function shortestPath(startNodeId, endNodeId) {
  if (!nodeById.has(startNodeId) || !nodeById.has(endNodeId)) return null
  const dist = new Map()
  const prev = new Map()
  const visited = new Set()
  for (const id of nodeById.keys()) dist.set(id, Infinity)
  dist.set(startNodeId, 0)

  while (visited.size < nodeById.size) {
    let u = null
    let best = Infinity
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d
        u = id
      }
    }
    if (u === null) break // remaining nodes are unreachable
    if (u === endNodeId) break
    visited.add(u)
    for (const { to, d } of adjacency.get(u) || []) {
      if (visited.has(to)) continue
      const alt = dist.get(u) + d
      if (alt < dist.get(to)) {
        dist.set(to, alt)
        prev.set(to, u)
      }
    }
  }

  if (dist.get(endNodeId) === Infinity) return null

  const pathIds = [endNodeId]
  let cur = endNodeId
  while (cur !== startNodeId) {
    cur = prev.get(cur)
    if (cur === undefined) return null
    pathIds.push(cur)
  }
  pathIds.reverse()

  const points = pathIds.map((id) => {
    const n = nodeById.get(id)
    return { id, lat: n.lat, lon: n.lon }
  })

  return {
    nodeIds: pathIds,
    points,
    distanceMeters: dist.get(endNodeId),
  }
}

/** Average adult walking speed used for the ETA shown to the user. */
const WALK_SPEED_MPS = 1.2

export function estimateWalkMinutes(distanceMeters) {
  return Math.max(1, Math.round(distanceMeters / WALK_SPEED_MPS / 60))
}
