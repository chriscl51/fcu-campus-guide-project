<script setup>
// Campus map screen: the school's own illustrated campus map artwork is the
// map, and the deer walks a real computed Dijkstra route across it.
//
// The map used to be drawn as vectors here (building footprints + labels +
// gates + POIs projected from OSM data). That whole layer is gone — the
// official artwork already draws every building, its code, its name and the
// gates, far better than we could, so re-drawing them on top just fought with
// the picture. See utils/mapProjection.js for how lat/lon is georeferenced
// onto the artwork (short version: 28 measured control points, affine fit,
// plus endpoint anchoring so the deer starts/stops exactly on the right
// building).
//
// LAYER ORDER:
//   1. the map image                    <- painted first
//   2. the route polyline               <- drawn on top, visible
//   3. the destination halo + the deer  <- drawn last, on top of everything
// The route line was hidden earlier because a straight chord drawn across a
// building or pond on the illustrated map read as broken even when the deer's
// actual walk was fine — several graph edges really were cutting through
// buildings/courts/ponds. Those underlying graph bugs have since been found
// and fixed (see testing-notes/README.md for the audit), so the line is
// visible again as a second, independent way to confirm the walk at a glance.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { MAP_IMAGE, projectMap, warpRoute, anchorFor } from '../utils/mapProjection'
import { playFootstep } from '../utils/sound'
import { publicUrl } from '../utils/publicUrl'
import DeerSprite from './DeerSprite.vue'
import graph from '../data/graph.json'
import gates from '../data/gates.json'
import { haversine } from '../utils/projection'

const props = defineProps({
  route: { type: Object, required: true }, // { points, distanceMeters, etaMinutes, steps }
  destinationBuilding: { type: Object, required: true },
  // Optional: lets the deer's *start* be pinned to where the artwork draws the
  // origin building/gate. Omitted (e.g. drive mode, where the origin is a
  // parking lot with no label on the artwork) just means the start falls back
  // to the plain affine position.
  originId: { type: String, default: null },
})
const emit = defineEmits(['arrived'])

// Where the artwork draws the destination — used for the "you're heading here"
// halo. Falls back to the affine estimate for anything unlabelled.
const destPos = computed(
  () =>
    anchorFor(props.destinationBuilding?.id) ||
    projectMap(props.destinationBuilding.lat, props.destinationBuilding.lon)
)

// Feedback item: 逢甲智慧創新港's only campus-side approach requires leaving
// through North Gate and walking a public sidewalk along Xi'an St — that's
// not obvious just from the drawn line (nothing on the map marks the gate as
// "you're now off campus"), so show an explicit note whenever the computed
// route actually passes near North Gate on the way there. Checked by
// proximity (within 30m of the gate's own coordinate), not exact node id —
// the real surveyed route passes a nearby path node a few metres from the
// gate's own entranceNode, never that exact id. The East Gate approach stays
// on campus the whole way and never comes near North Gate, so this stays
// false for it without needing a separate check.
const NORTH_GATE = gates.find((g) => g.id === 'gate-north')
const showXianStreetNote = computed(
  () =>
    props.destinationBuilding?.officialCode === 'IH' &&
    props.route.points.some((p) => haversine(p, NORTH_GATE) < 30)
)

// ---- debug overlay: the ENTIRE graph.json path network, drawn visibly on
// top of the artwork so gaps/wrong stretches in the surveyed data can be
// spotted by eye instead of by manually checking coordinates. Dev/maintenance
// aid only — toggled by pressing "g", never shown by default. One <path>
// with many "M..L.." subpaths (not one <line> per edge) so ~3500+ edges don't
// turn into that many separate DOM nodes.
const showDebugGraph = ref(false)
function toggleDebugGraph(e) {
  if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) showDebugGraph.value = !showDebugGraph.value
}
window.addEventListener('keydown', toggleDebugGraph)
onBeforeUnmount(() => window.removeEventListener('keydown', toggleDebugGraph))

const debugGraphPath = computed(() => {
  if (!showDebugGraph.value) return ''
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  let d = ''
  for (const e of graph.edges) {
    const a = nodeById.get(e.a)
    const b = nodeById.get(e.b)
    if (!a || !b) continue
    const pa = projectMap(a.lat, a.lon)
    const pb = projectMap(b.lat, b.lon)
    d += `M${pa.x.toFixed(1)},${pa.y.toFixed(1)} L${pb.x.toFixed(1)},${pb.y.toFixed(1)} `
  }
  return d
})

// ---- route path + deer animation -----------------------------------------
const routePoints = computed(() =>
  warpRoute(props.route.points, props.originId, props.destinationBuilding?.id)
)
const routePath = computed(() =>
  routePoints.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
)

// cumulative distance (in projected units, proportional to meters) along the route
const cumulative = computed(() => {
  const pts = routePoints.value
  const arr = [0]
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    arr.push(arr[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  return arr
})
const totalLen = computed(() => cumulative.value[cumulative.value.length - 1] || 1)

const deerX = ref(routePoints.value[0]?.x ?? 0)
const deerY = ref(routePoints.value[0]?.y ?? 0)
const progress = ref(0) // 0..1
const arrived = ref(false)

function positionAt(frac) {
  const target = frac * totalLen.value
  const pts = routePoints.value
  const cum = cumulative.value
  let i = 1
  while (i < cum.length && cum[i] < target) i++
  const prev = pts[Math.max(0, i - 1)]
  const cur = pts[Math.min(pts.length - 1, i)]
  const segLen = cum[i] - cum[i - 1] || 1
  const segFrac = (target - cum[i - 1]) / segLen
  const x = prev.x + (cur.x - prev.x) * segFrac
  const y = prev.y + (cur.y - prev.y) * segFrac
  return { x, y }
}

// Animation duration scales gently with route length so a short hop and a
// cross-campus trek both feel reasonable, clamped to a sane UX range.
// Feedback item: with the turn-by-turn text gone, the visible route line is
// the main way people follow the walk, so the pace is deliberately slow
// (~3.5x the original) to give time to actually read the map.
const DURATION_MS = computed(() => Math.min(60000, Math.max(12800, props.route.distanceMeters * 128)))
// How long the deer stands at the destination, route line still visible,
// before the arrival modal pops up and covers the map.
const LINGER_MS = 7200

let rafId = null
let startTime = null
let lastFootstepAt = 0
let lingerTimeoutId = null

function step(now) {
  if (startTime === null) startTime = now
  const elapsed = now - startTime
  const frac = Math.min(1, elapsed / DURATION_MS.value)
  progress.value = frac
  const pos = positionAt(frac)
  deerX.value = pos.x
  deerY.value = pos.y
  if (now - lastFootstepAt > 380 && frac < 1) {
    playFootstep()
    lastFootstepAt = now
  }
  if (frac < 1) {
    rafId = requestAnimationFrame(step)
  } else {
    finish()
  }
}

function finish() {
  if (arrived.value) return
  arrived.value = true
  const last = routePoints.value[routePoints.value.length - 1]
  deerX.value = last.x
  deerY.value = last.y
  lingerTimeoutId = setTimeout(() => emit('arrived'), LINGER_MS)
}

function start() {
  cancelAnim()
  startTime = null
  progress.value = 0
  arrived.value = false
  rafId = requestAnimationFrame(step)
}

function cancelAnim() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  if (lingerTimeoutId) clearTimeout(lingerTimeoutId)
  lingerTimeoutId = null
}

function skipToEnd() {
  cancelAnim()
  finish()
}

watch(() => props.route, start, { immediate: true })
onBeforeUnmount(cancelAnim)

// The SVG coordinate system IS the artwork's pixel space, so the image can be
// dropped in at 0,0 at natural size and every projected point lines up with it.
const viewBox = `0 0 ${MAP_IMAGE.width} ${MAP_IMAGE.height}`
const aspect = MAP_IMAGE.width / MAP_IMAGE.height
// Deer/halo sizes are in artwork pixels. Sized generously on purpose: the
// illustration is a busy, colourful drawing, so a deer scaled to the old
// vector map's proportions just disappeared into it. DeerSprite's art is
// 140x100, so the foreignObject is DEER_SIZE wide by DEER_SIZE*(100/140) tall,
// and the sprite's feet sit at the bottom edge — that bottom edge is what gets
// placed on the route point.
const DEER_SIZE = 132
const DEER_H = DEER_SIZE * (100 / 140)

</script>

<template>
  <div class="campus-map-wrap">
    <div class="map-card card">
      <!-- Feedback item: top-left corner shows the user's own sticker
           artwork directly — deerStickerGowalk.png while walking the route,
           swapped for deerStickerFinish.png the moment `arrived` flips true. -->
      <img
        :src="publicUrl(arrived ? 'stickers/deer-finish.png' : 'stickers/deer-go-walk.png')"
        :alt="arrived ? '文華鹿 Finish' : '文華鹿 Go Walk'"
        class="corner-sticker"
        :class="{ 'corner-sticker-finish': arrived }"
      />
      <svg class="campus-svg" :viewBox="viewBox" :style="{ aspectRatio: aspect }" preserveAspectRatio="xMidYMid meet">
        <!-- LAYER 1 — the official illustrated campus map. This IS the map. -->
        <image
          :href="publicUrl(MAP_IMAGE.src)"
          x="0"
          y="0"
          :width="MAP_IMAGE.width"
          :height="MAP_IMAGE.height"
          class="campus-map-image"
        />

        <!-- LAYER 2 — the routing graph's computed path, drawn on top of the
             map so the deer's route is visible. -->
        <path :d="routePath" class="route-line" />

        <!-- DEBUG ONLY — the whole graph.json path network, visible on top of
             the artwork. Off by default; press "g" to toggle. Not part of
             the normal user-facing layer order above. -->
        <path v-if="showDebugGraph" :d="debugGraphPath" class="debug-graph-overlay" />

        <!-- LAYER 3 — only what has to sit on top of the artwork. -->
        <g class="dest-marker">
          <circle :cx="destPos.x" :cy="destPos.y" r="46" class="dest-ring-outer" />
          <circle :cx="destPos.x" :cy="destPos.y" r="26" class="dest-ring-inner" />
        </g>

        <ellipse :cx="deerX" :cy="deerY" rx="40" ry="16" class="deer-halo" />
        <foreignObject
          :x="deerX - DEER_SIZE / 2"
          :y="deerY - DEER_H"
          :width="DEER_SIZE"
          :height="DEER_H"
          class="deer-fo"
        >
          <DeerSprite :size="DEER_SIZE" />
        </foreignObject>
      </svg>
    </div>

    <div class="route-info card">
      <p class="route-following">{{ $t('routing.following') }}</p>
      <div class="route-stats">
        <div>
          <strong>{{ $t('routing.etaLabel') }}</strong>
          <span>{{ $t('routing.minutes', { min: route.etaMinutes }) }}</span>
        </div>
        <div>
          <strong>{{ $t('routing.distanceLabel', { distance: route.distanceMeters }) }}</strong>
        </div>
      </div>
      <p v-if="showXianStreetNote" class="xian-street-note">{{ $t('routing.xianStreetNote') }}</p>
      <button type="button" class="btn ghost skip-btn" @click="skipToEnd" v-if="!arrived">
        {{ $t('routing.skipToEnd') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.campus-map-wrap {
  display: grid;
  /* Feedback item: the map should dominate the layout — text directions only
     need about a quarter of the width now, not two-fifths. */
  grid-template-columns: 3fr 1fr;
  gap: 1rem;
  width: 100%;
}
.map-card {
  position: relative;
  padding: 0.5rem;
}
.corner-sticker {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  width: clamp(64px, 14%, 110px);
  height: auto;
  z-index: 5;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
  pointer-events: none;
  animation: corner-sticker-bob 2.2s ease-in-out infinite;
}
.corner-sticker-finish {
  animation: corner-sticker-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes corner-sticker-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
@keyframes corner-sticker-pop {
  0% {
    transform: scale(0.4) rotate(-8deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.15) rotate(4deg);
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}
.campus-svg {
  width: 100%;
  height: auto;
  display: block;
  background: #f3ede1;
  border-radius: 10px;
}
/* The route the deer follows, drawn on top of the map artwork. */
.route-line {
  stroke: var(--fcu-maroon);
  stroke-width: 6;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
  filter: drop-shadow(0 1px 2px rgba(43, 35, 32, 0.35));
}
/* Debug-only: the full graph.json path network, drawn over the artwork so
   gaps/wrong stretches in the surveyed data can be spotted by eye. Toggle
   with "g". Bright cyan on purpose — nothing else on the map looks like it. */
.debug-graph-overlay {
  stroke: #00e5ff;
  stroke-width: 2;
  stroke-opacity: 0.85;
  fill: none;
  pointer-events: none;
}
.campus-map-image {
  /* Keeps the illustration's fine label text sharp when the card scales the
     1800px artwork down to whatever width the layout gives it. */
  image-rendering: auto;
}
/* Destination "you're heading here" halo — the one marker allowed on top of
   the artwork, so the user can see which building the route ends at. */
.dest-ring-outer {
  fill: rgba(212, 168, 83, 0.28);
  stroke: var(--fcu-maroon);
  stroke-width: 5;
  animation: dest-pulse 2s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
.dest-ring-inner {
  fill: none;
  stroke: var(--fcu-maroon);
  stroke-width: 4;
  opacity: 0.75;
}
@keyframes dest-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.95;
  }
  50% {
    transform: scale(1.18);
    opacity: 0.6;
  }
}
/* Ground shadow under the deer's feet — an ellipse rather than a circle so it
   reads as the deer standing ON the map rather than a dot behind it. */
.deer-halo {
  fill: rgba(60, 40, 20, 0.28);
}
.deer-fo {
  overflow: visible;
  /* White rim + drop shadow so the sprite stays legible over any part of the
     illustration (pale roads, dark green planting, the red running track). */
  filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 6px #fff)
    drop-shadow(0 6px 10px rgba(0, 0, 0, 0.45));
}
.skip-btn {
  align-self: flex-start;
  margin-top: 0.4rem;
  font-size: 1.15rem;
  padding: 0.55em 1.3em;
}
.route-info {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.route-following {
  font-weight: 700;
  font-size: 1.3rem;
  color: var(--fcu-maroon);
}
/* Feedback item: with the turn-by-turn text list gone, this is the only
   textual info left on the route screen, so it needs to read clearly at a
   glance rather than blend in as fine print. */
.route-stats {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.3;
}
.route-stats strong {
  margin-right: 0.4em;
}
/* Warns that this specific route leaves campus through North Gate onto a
   public sidewalk — not obvious from the drawn line alone. */
.xian-street-note {
  margin: 0;
  padding: 0.6em 0.8em;
  font-size: 1rem;
  font-weight: 600;
  color: var(--fcu-blue-dark);
  background: color-mix(in srgb, var(--fcu-blue-dark) 10%, transparent);
  border-left: 4px solid var(--fcu-blue-dark);
  border-radius: 4px;
}

@media (max-width: 780px) {
  .campus-map-wrap {
    grid-template-columns: 1fr;
  }
}
</style>
