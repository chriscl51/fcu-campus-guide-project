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
// LAYER ORDER MATTERS AND IS DELIBERATE:
//   1. the route polyline   <- drawn FIRST, so it ends up underneath
//   2. the map image        <- painted over it, hiding the route completely
//   3. the destination halo + the deer  <- drawn last, so they stay visible
// The route line is still in the DOM (it's what the deer follows, and it's
// handy when debugging alignment) but the user never sees it, which is the
// requirement: 「graph 路線圖層要隱藏在 new fcu map 下方…user 不能看到 graph 的線條」.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MAP_IMAGE, projectMap, warpRoute, anchorFor } from '../utils/mapProjection'
import { playFootstep } from '../utils/sound'
import DeerSprite from './DeerSprite.vue'

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
const { t } = useI18n()

// Where the artwork draws the destination — used for the "you're heading here"
// halo. Falls back to the affine estimate for anything unlabelled.
const destPos = computed(
  () =>
    anchorFor(props.destinationBuilding?.id) ||
    projectMap(props.destinationBuilding.lat, props.destinationBuilding.lon)
)

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
        <!-- LAYER 1 — the routing graph's computed path. Deliberately drawn
             before the map image so the image paints straight over it: the
             deer follows it, the user never sees it. -->
        <path :d="routePath" class="route-line-hidden" />

        <!-- LAYER 2 — the official illustrated campus map. This IS the map. -->
        <image
          :href="MAP_IMAGE.src"
          x="0"
          y="0"
          :width="MAP_IMAGE.width"
          :height="MAP_IMAGE.height"
          class="campus-map-image"
        />

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
/* The route the deer follows. It sits UNDER the map image, so it is never
   visible to the user — this styling only matters if the image ever fails to
   load, and when temporarily reordering the layers to check alignment. */
.route-line-hidden {
  stroke: var(--fcu-maroon);
  stroke-width: 10;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  gap: 0.525rem;
  font-size: 1.38rem;
  line-height: 1.55;
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
