<script setup>
// Self-contained vector campus map: renders the real surveyed path network,
// buildings, and POIs, then walks the pixel deer along the computed Dijkstra
// route. No external map tiles/APIs — everything is drawn from src/data/*.json
// projected into flat SVG coordinates by utils/projection.js.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import buildings from '../data/buildings.json'
import poisData from '../data/pois.json'
import gatesData from '../data/gates.json'
import { parkingLots } from '../utils/parking'
import { selectableBuildings } from '../utils/buildingOptions'
import { project, WORLD, haversine } from '../utils/projection'
import { playFootstep } from '../utils/sound'
import DeerSprite from './DeerSprite.vue'

const props = defineProps({
  route: { type: Object, required: true }, // { points, distanceMeters, etaMinutes, steps }
  destinationBuilding: { type: Object, required: true },
})
const emit = defineEmits(['arrived'])
const { t } = useI18n()

// Feedback item: the raw routable graph (1074 nodes / 3558 edges — every
// surveyed sidewalk segment) used to be drawn as a dense mesh of grey lines
// under the map ("edge/node圖層很醜"). Real campus paper maps don't show a
// path-finding graph, just buildings + roads, so this layer is no longer
// rendered at all — only the highlighted route line (below) is drawn. The
// graph itself is still fully used for Dijkstra routing, just not painted.
// (graph.json is still imported by utils/routing.js for the actual pathfinding.)

// Building footprints (real surveyed polygons — see scripts/parse_osm.py) are
// drawn as filled shapes so the map reads like the official campus signboard
// map (solid building blocks + labels) instead of a single dot per building.
// Buildings with no surveyed polygon (rare — a couple of POI-only landmarks)
// fall back to a dot marker via `footprint.length === 0`. Filtered through
// selectableBuildings() — the same official-map filter the destination
// dropdowns use — so a building/lot that isn't on the official campus map
// (no officialCode, or explicitly excluded via NOT_ON_OFFICIAL_MAP) doesn't
// get drawn on the map either, even though its data stays in buildings.json.
const buildingMarkers = selectableBuildings(buildings).map((b) => {
  const pos = project(b.lat, b.lon)
  const footprintPts = (b.footprint || []).map(([lat, lon]) => project(lat, lon))
  const footprintPath = footprintPts.length >= 3
    ? footprintPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
    : null
  return { ...b, pos, footprintPath }
})

// Gate markers (西門/東門/北門), styled like the red gate labels on the
// official schematic map.
const gateMarkers = gatesData.map((g) => ({ ...g, pos: project(g.lat, g.lon) }))

const POI_STYLE = {
  toilets: { color: '#7a4620', icon: '🚻' },
  drinking_water: { color: '#006b93', icon: '💧' },
  elevator: { color: '#5b3fa0', icon: '🛗' },
  aed: { color: '#c0392b', icon: '❤️' },
  parking: { color: '#3a3a3a', icon: '🅿️' },
  parking_space: { color: '#3a3a3a', icon: '🅿️' },
  bench: { color: '#8a7a5c', icon: '🪑' },
}
// Keep the map from being overwhelmed with 100+ icons: only show POIs within
// ~90m of the destination (they matter most once you've arrived), plus the
// two curated parking lots (see utils/parking.js — the raw survey has 19
// mostly-unlabeled "parking" ways, trimmed down to the two real, nameable
// destinations: 凱旋停車場 and the 體育館 underground lot).
const PARKING_LOT_IDS = new Set(parkingLots.map((lot) => String(lot.id)))
const poiMarkers = computed(() => {
  const dest = props.destinationBuilding
  return poisData
    .filter((p) => {
      if (p.kind === 'parking' || p.kind === 'parking_space') return PARKING_LOT_IDS.has(String(p.id))
      return haversine({ lat: p.lat, lon: p.lon }, dest) <= 90
    })
    .map((p) => ({ ...p, pos: project(p.lat, p.lon), style: POI_STYLE[p.kind] }))
})

// ---- route path + deer animation -----------------------------------------
const routePoints = computed(() => props.route.points.map((p) => project(p.lat, p.lon)))
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
const deerFacing = ref('right')
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
  if (cur.x !== prev.x) deerFacing.value = cur.x >= prev.x ? 'right' : 'left'
  return { x, y }
}

// Animation duration scales gently with route length so a short hop and a
// cross-campus trek both feel reasonable, clamped to a sane UX range.
const DURATION_MS = computed(() => Math.min(22000, Math.max(4500, props.route.distanceMeters * 45)))

let rafId = null
let startTime = null
let lastFootstepAt = 0

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
  emit('arrived')
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
}

function skipToEnd() {
  cancelAnim()
  finish()
}

watch(() => props.route, start, { immediate: true })
onBeforeUnmount(cancelAnim)

const viewBox = `0 0 ${WORLD.width.toFixed(0)} ${WORLD.height.toFixed(0)}`
const aspect = WORLD.width / WORLD.height

function directionLabel(step) {
  if (step.type === 'straight') return t('directions.straight', { distance: step.distanceMeters })
  if (step.type === 'left') return t('directions.left')
  if (step.type === 'right') return t('directions.right')
  return t('directions.arrive')
}
</script>

<template>
  <div class="campus-map-wrap">
    <div class="map-card card">
      <!-- Feedback item: top-left corner shows the user's own sticker
           artwork directly — deerStickerGowalk.png while walking the route,
           swapped for deerStickerFinish.png the moment `arrived` flips true. -->
      <img
        :src="arrived ? '/stickers/deer-finish.png' : '/stickers/deer-go-walk.png'"
        :alt="arrived ? '文華鹿 Finish' : '文華鹿 Go Walk'"
        class="corner-sticker"
        :class="{ 'corner-sticker-finish': arrived }"
      />
      <svg class="campus-svg" :viewBox="viewBox" :style="{ aspectRatio: aspect }" preserveAspectRatio="xMidYMid meet">
        <path :d="routePath" class="route-line" />

        <g
          v-for="b in buildingMarkers"
          :key="b.id"
          class="building-marker"
          :class="{ dest: b.id === destinationBuilding.id, partial: b.tier === 'partial' }"
        >
          <path v-if="b.footprintPath" :d="b.footprintPath" class="building-shape" />
          <circle v-else :cx="b.pos.x" :cy="b.pos.y" :r="b.id === destinationBuilding.id ? 7 : 4" class="building-dot" />
          <text :x="b.pos.x" :y="b.pos.y - 2" class="building-code">{{ b.officialCode || b.roomCode || '' }}</text>
          <text :x="b.pos.x" :y="b.pos.y + 7" class="building-name">{{ b.nameZh }}</text>
        </g>

        <g v-for="g in gateMarkers" :key="g.id" class="gate-marker">
          <circle :cx="g.pos.x" :cy="g.pos.y" r="5" class="gate-dot" />
          <text :x="g.pos.x" :y="g.pos.y - 9" class="gate-label">{{ g.nameZh }}</text>
        </g>

        <g v-for="p in poiMarkers" :key="p.id" class="poi-marker">
          <circle :cx="p.pos.x" :cy="p.pos.y" r="2.4" :fill="p.style?.color || '#999'" />
        </g>

        <circle :cx="deerX" :cy="deerY" r="10" class="deer-halo" />
        <foreignObject :x="deerX - 16" :y="deerY - 23" width="32" height="23" class="deer-fo">
          <DeerSprite :size="32" :facing="deerFacing" walking />
        </foreignObject>
      </svg>

      <button type="button" class="btn ghost skip-btn" @click="skipToEnd" v-if="!arrived">
        {{ $t('routing.skipToEnd') }}
      </button>
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
      <h3>{{ $t('routing.directionsTitle') }}</h3>
      <ol class="directions-list">
        <li v-for="(step, i) in route.steps" :key="i" :class="step.type">
          {{ directionLabel(step) }}
        </li>
      </ol>
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
.route-line {
  stroke: var(--fcu-maroon);
  stroke-width: 3.2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 6 5;
  animation: dash-move 1.2s linear infinite;
}
@keyframes dash-move {
  to {
    stroke-dashoffset: -22;
  }
}
/* Filled building blocks, styled after the official campus schematic map:
   soft blue-grey for full-tier (has facility data), muted taupe for partial
   (data pending), gold + maroon outline for the current destination. */
.building-shape {
  fill: #aab9c4;
  stroke: #8b9aa6;
  stroke-width: 1;
  paint-order: stroke;
}
.building-marker.partial .building-shape {
  fill: #c9beac;
  stroke: #b0a38c;
}
.building-marker.dest .building-shape {
  fill: var(--fcu-gold);
  stroke: var(--fcu-maroon);
  stroke-width: 1.75;
}
.building-dot {
  fill: var(--fcu-blue);
  stroke: #fff;
  stroke-width: 1;
}
.building-marker.partial .building-dot {
  fill: #b7ab98;
}
.building-marker.dest .building-dot {
  fill: var(--fcu-gold);
  stroke: var(--fcu-maroon);
  stroke-width: 1.5;
}
.building-code {
  font-size: 11px;
  font-weight: 800;
  text-anchor: middle;
  fill: var(--fcu-maroon-dark);
  pointer-events: none;
}
.building-marker.partial .building-code {
  fill: #6b5f4d;
}
.building-name {
  font-size: 7.5px;
  font-weight: 600;
  text-anchor: middle;
  fill: var(--text-muted);
  pointer-events: none;
}
.gate-marker .gate-dot {
  fill: #c0392b;
  stroke: #fff;
  stroke-width: 1;
}
.gate-label {
  font-size: 10px;
  font-weight: 700;
  text-anchor: middle;
  fill: #c0392b;
  pointer-events: none;
}
.deer-halo {
  fill: rgba(129, 27, 41, 0.15);
}
.deer-fo {
  overflow: visible;
}
.skip-btn {
  position: absolute;
  bottom: 0.75rem;
  right: 0.75rem;
  font-size: 0.8rem;
  padding: 0.4em 0.9em;
}
.route-info {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.route-following {
  font-weight: 700;
  color: var(--fcu-maroon);
}
.route-stats {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.92rem;
}
.route-stats strong {
  margin-right: 0.4em;
}
.directions-list {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.92rem;
}
.directions-list li.left,
.directions-list li.right {
  font-weight: 700;
  color: var(--fcu-blue-dark);
}
.directions-list li.arrive {
  font-weight: 700;
  color: var(--fcu-maroon);
}

@media (max-width: 780px) {
  .campus-map-wrap {
    grid-template-columns: 1fr;
  }
}
</style>
