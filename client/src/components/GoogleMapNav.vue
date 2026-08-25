<script setup>
// GoogleMapNav.vue — Main navigation component using Leaflet (free, no API key)
// + OSRM routing (free, no API key). Replaces the old self-built Dijkstra nav.
//
// Handles both driving and walking flows on a single page (no router.push).
// State-driven mode switching via reactive variables.
//
// FLOW 1 — Walking Only:
//   From/To pre-filled → auto-route → walking route + turn-by-turn + building info
//
// FLOW 2 — Driving + Walking:
//   Destination pre-filled + auto-suggested parking lot → user enters origin →
//   driving route → deer prompt → same-page switch to walking (lot → building)
import { ref, computed, onMounted, onUnmounted, shallowRef, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore, STEP } from '../stores/app'
import { useBilingual } from '../utils/bilingual'
import { loadLeaflet, fetchRoute } from '../utils/googleMaps'
import { googleMapsDirectionsUrl } from '../utils/mapsLink'
import { publicUrl } from '../utils/publicUrl'
import { fetchUpcomingEvents } from '../utils/api.js'
import { formatWallClock } from '../utils/dateFormat.js'
import { CAMPUS_CENTER, LEAFLET_MAX_BOUNDS } from '../utils/campusBounds.js'
import noCrossingZones from '../data/noCrossingZones.js'
import FacilityPanel from './FacilityPanel.vue'

const store = useAppStore()
const { t, locale } = useI18n({ useScope: 'global' })
const { btName } = useBilingual()

// ---- State ----------------------------------------------------------------
const currentMode = ref(store.navigationMode === 'driving' ? 'driving' : 'walking')

// Watch locale changes and re-render route directions in user's language immediately
watch(locale, () => {
  if (currentMode.value === 'walking' && routeReady.value) {
    const from = (store.originId === DRIVE_MODE_ORIGIN && suggestedParking.value)
      ? { lat: suggestedParking.value.lat, lon: suggestedParking.value.lon, nameZh: suggestedParking.value.nameZh }
      : originBuilding.value
    if (from && destBuilding.value) {
      startWalkingRoute(from, destBuilding.value)
    }
  }
})

// Header sticker — changes based on mode
const headerSticker = computed(() => {
  if (currentMode.value === 'driving') return publicUrl('stickers/deer-go.png')
  if (routeReady.value) return publicUrl('stickers/deer-finish.png')
  return publicUrl('stickers/deer-go-walk.png')
})

const headerStickerAlt = computed(() => {
  if (currentMode.value === 'driving') return '文華鹿 Go (Driving)'
  if (routeReady.value) return '文華鹿 Finish'
  return '文華鹿 Go Walk'
})

// Map instances
const leafletMap = shallowRef(null)
const routeLayer = shallowRef(null)
const currentRouteCoords = ref([])
const mapsError = ref(null)
const mapsLoading = ref(true)
const routeLoading = ref(false)

// Driving mode
const userOrigin = ref('')
const drivingRouteReady = ref(false)
const showDeerPrompt = ref(false)

// Walking mode
const walkingSteps = ref([])
const routeReady = ref(false)
const routeInfo = ref(null) // { distanceMeters, durationMinutes }

// Upcoming events for destination building
const upcomingEvents = ref([])
const buildingEvents = computed(() => {
  if (!destBuilding.value) return []
  return upcomingEvents.value.filter((e) =>
    (e.locations || []).some((loc) => loc.buildingId === destBuilding.value.id)
  )
})

function formatEventTime(e) {
  const start = formatWallClock(e.start_date, locale.value)
  const end = formatWallClock(e.end_date, locale.value)
  return e.start_date === e.end_date ? start : `${start} – ${end}`
}

function eventTypeBadge(type) {
  const isZh = locale.value === 'zh-TW'
  switch (type) {
    case 'exam': return { text: isZh ? '📝 考試' : '📝 Exam', class: 'type-exam' }
    case 'lecture': return { text: isZh ? '🎤 講座' : '🎤 Lecture', class: 'type-lecture' }
    case 'recruit': return { text: isZh ? '💼 徵才' : '💼 Career', class: 'type-recruit' }
    case 'activity': return { text: isZh ? '🎉 活動' : '🎉 Event', class: 'type-activity' }
    default: return { text: isZh ? '📌 公告' : '📌 Notice', class: 'type-other' }
  }
}

// Destination building info
const destBuilding = computed(() => store.destinationBuilding)
const suggestedParking = computed(() => store.suggestedParking)
const originBuilding = computed(() => store.originBuilding)

function buildingLabel(b) {
  if (!b) return ''
  const name = btName(b) || b.nameZh || b.name
  return b.officialCode ? `${b.officialCode}｜${name}` : name
}

// ---- Leaflet map setup ----------------------------------------------------
onMounted(async () => {
  try {
    // Fetch upcoming events for active building banner
    fetchUpcomingEvents().then((events) => {
      if (events) upcomingEvents.value = events
    }).catch(() => {})

    const L = await loadLeaflet()
    const container = document.getElementById('gmap-container')
    if (!container) return

    // If map instance already exists on this container, clean it up safely
    if (leafletMap.value) {
      try {
        leafletMap.value.remove()
      } catch {
        // ignore
      }
      leafletMap.value = null
    }

    leafletMap.value = L.map('gmap-container', {
      center: CAMPUS_CENTER,
      zoom: 16,
      minZoom: 11,
      maxZoom: 19,
      zoomControl: true,
      attributionControl: true,
    })

    // OpenStreetMap tiles — free, no key (crossOrigin enabled for canvas capture)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(leafletMap.value)

    // Render No-Crossing Zones (Lotus Pond / Construction zones)
    noCrossingZones.forEach((zone) => {
      L.polygon(zone.coordinates, {
        color: zone.color || '#4a90e2',
        fillColor: zone.fillColor || '#a0c8f0',
        fillOpacity: zone.fillOpacity || 0.45,
        weight: 2,
        dashArray: '4, 4',
      })
        .bindTooltip(locale.value === 'zh-TW' ? zone.nameZh : zone.nameEn, { direction: 'center', permanent: false })
        .addTo(leafletMap.value)
    })

    mapsLoading.value = false
    await nextTick()
    if (leafletMap.value) leafletMap.value.invalidateSize()
    setTimeout(() => {
      if (leafletMap.value) leafletMap.value.invalidateSize()
    }, 150)

    // If walking-only mode and we have origin + destination, auto-route
    if (currentMode.value === 'walking' && originBuilding.value && destBuilding.value) {
      startWalkingRoute(originBuilding.value, destBuilding.value)
    }
  } catch (err) {
    mapsError.value = err.message
    mapsLoading.value = false
  }
})

onUnmounted(() => {
  if (leafletMap.value) {
    try {
      leafletMap.value.remove()
    } catch {
      // ignore
    }
    leafletMap.value = null
  }
})

// ---- Draw route on map ----------------------------------------------------
function drawRoute(geometry, fromCoord, toCoord, color = '#811b29') {
  const L = window.L
  if (!leafletMap.value || !L) return

  // Clear previous route
  if (routeLayer.value) {
    leafletMap.value.removeLayer(routeLayer.value)
  }

  const group = L.featureGroup()

  // Route line
  const coords = geometry.coordinates.map(([lng, lat]) => [lat, lng])
  currentRouteCoords.value = coords

  L.polyline(coords, {
    color: color,
    weight: 6,
    opacity: 0.88,
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(group)

  const fromLat = fromCoord.lat
  const fromLon = fromCoord.lon ?? fromCoord.lng
  const toLat = toCoord.lat
  const toLon = toCoord.lon ?? toCoord.lng

  // Start marker
  if (fromLat != null && fromLon != null) {
    const startName = btName(fromCoord) || fromCoord.nameZh || fromCoord.name || t('select.originLabel') || '出發地'
    const startIcon = L.divIcon({
      html: '<div style="width:16px;height:16px;background:#27ae60;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    })
    L.marker([fromLat, fromLon], { icon: startIcon })
      .bindPopup(`<strong>${startName}</strong>`)
      .addTo(group)
  }

  // End marker
  if (toLat != null && toLon != null) {
    const endName = btName(toCoord) || toCoord.nameZh || toCoord.name || t('select.destinationLabel') || '目的地'
    const endIcon = L.divIcon({
      html: '<div style="width:20px;height:20px;background:#811b29;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      className: '',
    })
    L.marker([toLat, toLon], { icon: endIcon })
      .bindPopup(`<strong>${endName}</strong>`)
      .addTo(group)
  }

  group.addTo(leafletMap.value)
  routeLayer.value = group

  leafletMap.value.invalidateSize()
  try {
    const bounds = group.getBounds()
    if (bounds.isValid()) {
      leafletMap.value.fitBounds(bounds.pad(0.15))
    }
  } catch (err) {
    console.warn('fitBounds error:', err)
  }
}

// ---- DRIVING MODE ---------------------------------------------------------
async function startDrivingNav() {
  if (!suggestedParking.value) return
  routeLoading.value = true
  mapsError.value = null

  try {
    const originText = userOrigin.value.trim()
    if (!originText) return

    const geo = await geocodeAddress(originText)
    if (!geo) {
      mapsError.value = t('nav.routeError', { status: '找不到該出發地址，請輸入完整地名或地址' })
      return
    }

    const lot = suggestedParking.value
    const result = await fetchRoute(
      { lat: geo.lat, lon: geo.lon },
      { lat: lot.lat, lon: lot.lon },
      'car',
      locale.value
    )

    drawRoute(
      result.geometry,
      { lat: geo.lat, lon: geo.lon, nameZh: originText },
      { lat: lot.lat, lon: lot.lon, nameZh: lot.nameZh },
      '#2980b9'
    )

    drivingRouteReady.value = true
    setTimeout(() => { showDeerPrompt.value = true }, 1000)
  } catch (err) {
    mapsError.value = t('nav.routeError', { status: err.message })
  } finally {
    routeLoading.value = false
  }
}

// Nominatim free geocoder (no key needed)
async function geocodeAddress(text) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=1`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'zh-TW,zh,en' },
  })
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
}

// Open driving directions in Google Maps app
function openInGoogleMapsApp() {
  if (!suggestedParking.value) return
  const url = googleMapsDirectionsUrl(suggestedParking.value.lat, suggestedParking.value.lon, { travelmode: 'driving' })
  window.open(url, '_blank')
}

// ---- SWITCH TO WALKING (from driving mode) --------------------------------
function switchToWalking() {
  if (!suggestedParking.value || !destBuilding.value) return
  currentMode.value = 'walking'
  showDeerPrompt.value = false
  drivingRouteReady.value = false

  startWalkingRoute(
    { lat: suggestedParking.value.lat, lon: suggestedParking.value.lon, nameZh: suggestedParking.value.nameZh },
    destBuilding.value
  )
}

// ---- WALKING ROUTE --------------------------------------------------------
async function startWalkingRoute(from, to) {
  if (!from || !to) return
  if (!leafletMap.value) return
  routeLoading.value = true
  mapsError.value = null

  try {
    const result = await fetchRoute(from, to, 'foot', locale.value)

    drawRoute(
      result.geometry,
      from,
      to,
      '#811b29'
    )

    walkingSteps.value = result.steps
    routeInfo.value = {
      distanceMeters: result.distanceMeters,
      durationMinutes: result.durationMinutes,
    }
    routeReady.value = true
  } catch (err) {
    mapsError.value = t('nav.routeError', { status: err.message })
  } finally {
    routeLoading.value = false
  }
}

// ---- Open walking in Google Maps ------------------------------------------
function openWalkingInGoogleMaps() {
  if (!destBuilding.value) return
  const url = googleMapsDirectionsUrl(destBuilding.value.lat, destBuilding.value.lon, { travelmode: 'walking' })
  window.open(url, '_blank')
}

// Photo URL helper
function photoUrl(path) {
  if (!path) return ''
  return `${import.meta.env.BASE_URL}${path}`
}

// ---- EXPORT 2-PAGE A4 PDF FILE DIRECTLY (ONE-CLICK DOWNLOAD) --------------
const isPdfGenerating = ref(false)

async function exportPdf() {
  if (isPdfGenerating.value) return
  isPdfGenerating.value = true
  await nextTick()

  let pdfLeaflet = null
  try {
    const { default: html2canvas } = await import('html2canvas')
    const jsPDF = window.jspdf?.jsPDF
    if (!jsPDF) {
      window.print()
      return
    }

    // 1. Initialize dedicated Leaflet map in #pdf-dedicated-map (native portrait 916px x 1100px)
    const pdfMapEl = document.getElementById('pdf-dedicated-map')
    if (pdfMapEl) {
      pdfMapEl.innerHTML = ''
      pdfLeaflet = L.map(pdfMapEl, {
        zoomControl: false,
        attributionControl: false,
      })

      const pdfTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(pdfLeaflet)

      // Render No-Crossing Zones on PDF Map
      noCrossingZones.forEach((zone) => {
        L.polygon(zone.coordinates, {
          color: zone.color || '#4a90e2',
          fillColor: zone.fillColor || '#a0c8f0',
          fillOpacity: zone.fillOpacity || 0.45,
          weight: 2,
          dashArray: '4, 4',
        }).addTo(pdfLeaflet)
      })

      const startIcon = L.divIcon({
        className: 'custom-start-marker',
        html: '<div style="background:#27ae60;width:18px;height:18px;border-radius:50%;border:3.5px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
      const destIcon = L.divIcon({
        className: 'custom-dest-marker',
        html: '<div style="background:#811b29;width:18px;height:18px;border-radius:50%;border:3.5px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      if (currentRouteCoords.value.length > 0) {
        L.marker(currentRouteCoords.value[0], { icon: startIcon }).addTo(pdfLeaflet)
        L.marker(currentRouteCoords.value[currentRouteCoords.value.length - 1], { icon: destIcon }).addTo(pdfLeaflet)
        // Use a temporary polyline only to compute fitBounds — it is removed
        // immediately after, because html2canvas cannot reliably capture Leaflet's
        // SVG vector layer (it renders shifted). The route is instead drawn as a
        // canvas overlay in the html2canvas onclone callback below, which is the
        // only line that should end up in the exported PDF.
        const poly = L.polyline(currentRouteCoords.value)
        pdfLeaflet.invalidateSize({ animate: false, pan: false })
        pdfLeaflet.fitBounds(poly.getBounds().pad(0.18), { animate: false })
        pdfLeaflet.removeLayer(poly)
      }

      // Wait for the tiles in the fitted view to actually finish loading.
      // A single tileLayer 'load' event isn't reliable here — it can fire
      // for an early/partial batch while Leaflet is still issuing more tile
      // requests for the final view, leaving most of the exported map blank.
      // Poll isLoading() until it actually settles, capped so export never
      // hangs if a tile request stalls or drops.
      await new Promise((resolve) => {
        const start = Date.now()
        const minWaitMs = 300
        const maxWaitMs = 12000
        const poll = () => {
          const elapsed = Date.now() - start
          const stillLoading = pdfTileLayer.isLoading ? pdfTileLayer.isLoading() : false
          if ((!stillLoading && elapsed >= minWaitMs) || elapsed >= maxWaitMs) {
            resolve()
          } else {
            setTimeout(poll, 150)
          }
        }
        poll()
      })
    }

    // 2. Render Template Page 1 & Page 2
    const page1El = document.getElementById('fcu-pdf-page-1')
    const page2El = document.getElementById('fcu-pdf-page-2')
    if (!page1El || !page2El) return

    const p1Canvas = await html2canvas(page1El, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        const root = clonedDoc.getElementById('fcu-pdf-export-root')
        if (root) root.style.opacity = '1'
        const p1 = clonedDoc.getElementById('fcu-pdf-page-1')
        if (p1) p1.style.opacity = '1'

        const clonedMap = clonedDoc.getElementById('pdf-dedicated-map')
        if (clonedMap && pdfLeaflet && currentRouteCoords.value.length) {
          const w = clonedMap.clientWidth || clonedMap.offsetWidth
          const h = clonedMap.clientHeight || clonedMap.offsetHeight
          const routeCanvas = clonedDoc.createElement('canvas')
          routeCanvas.width = w
          routeCanvas.height = h
          routeCanvas.style.position = 'absolute'
          routeCanvas.style.top = '0'
          routeCanvas.style.left = '0'
          routeCanvas.style.width = '100%'
          routeCanvas.style.height = '100%'
          routeCanvas.style.zIndex = '450'
          routeCanvas.style.pointerEvents = 'none'

          const ctx = routeCanvas.getContext('2d')
          if (ctx) {
            ctx.strokeStyle = '#811b29'
            ctx.lineWidth = 6
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()

            currentRouteCoords.value.forEach(([lat, lng], i) => {
              const pt = pdfLeaflet.latLngToContainerPoint([lat, lng])
              if (i === 0) {
                ctx.moveTo(pt.x, pt.y)
              } else {
                ctx.lineTo(pt.x, pt.y)
              }
            })
            ctx.stroke()
          }
          clonedMap.appendChild(routeCanvas)
        }
      },
    })

    const p2Canvas = await html2canvas(page2El, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        const root = clonedDoc.getElementById('fcu-pdf-export-root')
        if (root) root.style.opacity = '1'
        const p2 = clonedDoc.getElementById('fcu-pdf-page-2')
        if (p2) p2.style.opacity = '1'
      },
    })

    // 3. Generate 2-Page A4 PDF Document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    // Add Page 1 (Map Only)
    doc.addImage(p1Canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
    // Add Page 2 (Walking Route)
    doc.addPage()
    doc.addImage(p2Canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)

    // 4. Trigger Direct File Download
    const filename = `${destBuilding.value?.nameZh || 'fcu'}-校園導航手冊.pdf`
    doc.save(filename)
  } catch (err) {
    console.error('PDF Generation failed:', err)
    window.print()
  } finally {
    if (pdfLeaflet) {
      pdfLeaflet.remove()
    }
    isPdfGenerating.value = false
  }
}

// ---- NAVIGATION BACK / RESET ----------------------------------------------
function backToSelect() {
  store.step = STEP.SELECT
}

function planAnother() {
  store.reset()
}
</script>

<template>
  <div class="google-map-nav">
    <!-- Top Back Navigation -->
    <div class="nav-top-bar">
      <button type="button" class="back-link-btn" @click="backToSelect">
        ← {{ t('common.back') }}
      </button>
    </div>

    <!-- Header Sticker — Cleanly centered, unblocked -->
    <header class="nav-hero">
      <img
        :src="headerSticker"
        :alt="headerStickerAlt"
        class="nav-hero-sticker"
        :class="{
          'sticker-driving': currentMode === 'driving',
          'sticker-finish': routeReady && currentMode === 'walking',
          'sticker-walking': !routeReady && currentMode === 'walking',
        }"
      />
    </header>

    <!-- Missing Destination Fallback -->
    <div v-if="!destBuilding && !mapsLoading" class="card empty-dest-card">
      <p class="empty-dest-text">尚未選擇目的地大樓，請先選取出發地與目的地</p>
      <button type="button" class="btn" @click="backToSelect">前往選擇起訖點</button>
    </div>

    <!-- Error state -->
    <div v-if="mapsError" class="card error-card">
      <p class="error-text">⚠️ {{ mapsError }}</p>
      <button type="button" class="btn ghost" @click="mapsError = null">{{ t('common.close') }}</button>
    </div>

    <!-- ============================================================= -->
    <!-- DRIVING MODE: Input Card on top of Map                          -->
    <!-- ============================================================= -->
    <div v-if="currentMode === 'driving' && !mapsLoading && !mapsError && destBuilding" class="driving-ui card">
      <div class="driving-header">
        <h2>🚗 {{ t('nav.drivingTitle') }}</h2>
        <span class="driving-mode-badge">開車＋步行模式</span>
      </div>

      <div class="driving-info-row">
        <div class="driving-dest">
          <span class="label-muted">{{ t('select.destinationLabel') }}</span>
          <strong class="dest-highlight">{{ buildingLabel(destBuilding) }}</strong>
        </div>
        <div v-if="suggestedParking" class="driving-parking">
          <span class="label-muted">{{ t('nav.suggestedParking') }}</span>
          <strong class="parking-highlight">🅿️ {{ suggestedParking.nameZh }}</strong>
          <span class="distance-note">{{ t('parking.distanceLabel', { distance: suggestedParking.distanceMeters }) }}</span>
        </div>
      </div>

      <div class="field driving-origin-field">
        <label for="user-origin-input">{{ t('nav.enterOrigin') }}</label>
        <div class="input-with-button">
          <input
            id="user-origin-input"
            v-model="userOrigin"
            type="text"
            :placeholder="t('nav.originPlaceholder')"
            @keyup.enter="startDrivingNav"
          />
          <button
            type="button"
            class="btn driving-start-btn"
            :disabled="!userOrigin.trim() || routeLoading"
            @click="startDrivingNav"
          >
            <span v-if="routeLoading" class="btn-loading">⏳</span>
            {{ t('nav.startDriving') }}
          </button>
        </div>
      </div>

      <div class="driving-links-row">
        <button type="button" class="btn secondary" @click="openInGoogleMapsApp">
          🗺️ {{ t('parking.openInGoogleMaps') }}
        </button>
      </div>

      <!-- Deer walking prompt -->
      <Transition name="prompt-fade">
        <div
          v-if="showDeerPrompt"
          class="deer-prompt"
          @click="switchToWalking"
        >
          <img :src="publicUrl('stickers/deer-follow-me.png')" alt="文華鹿" class="prompt-deer" />
          <div class="prompt-text">
            <p class="prompt-main">🦌 {{ t('nav.deerWalkingPrompt') }}</p>
            <p class="prompt-hint">{{ t('nav.deerWalkingHint') }} ➔</p>
          </div>
        </div>
      </Transition>
    </div>

    <!-- ============================================================= -->
    <!-- NAVIGATION RESULT AREA (MAP + CARDS)                          -->
    <!-- ============================================================= -->
    <div
      id="nav-capture-area"
      class="nav-capture-wrapper"
    >
      <!-- WALKING MODE: Route Summary Bar (Shown when route calculated) -->
      <div v-if="currentMode === 'walking' && routeReady && routeInfo" class="route-summary card">
        <div class="route-summary-stats">
          <span class="route-stat">🚶 {{ t('routing.minutes', { min: routeInfo.durationMinutes }) }}</span>
          <span class="route-stat">📏 {{ t('routing.distanceLabel', { distance: routeInfo.distanceMeters }) }}</span>
        </div>
        <button type="button" class="btn secondary open-gmaps-btn" @click="openWalkingInGoogleMaps">
          🗺️ {{ t('parking.openInGoogleMaps') }}
        </button>
      </div>

      <!-- Normal Layout Wrapper (Map on TOP, 3 cards on BOTTOM) -->
      <div class="nav-content-layout">
        <!-- 1. MAP SECTION (Page 1 in A4 Print) -->
        <div class="map-section-wrap">
          <!-- Print Page 1 Header (Visible only in Print / PDF) -->
          <div class="print-only print-page-header print-page1-header">
            <div class="print-header-main">
              <span class="print-badge">FCU CAMPUS GUIDE</span>
              <h2 class="print-title">逢甲大學校園生活導航指南 · FCU Campus Navigation Guide</h2>
            </div>
            <div class="print-header-meta">
              <span class="print-meta-route">🚩 起訖：{{ buildingLabel(originBuilding) }} ➔ 🎯 {{ buildingLabel(destBuilding) }}</span>
              <span v-if="routeInfo" class="print-meta-stat">🚶 預估步行：約 {{ routeInfo.durationMinutes }} 分鐘（{{ routeInfo.distanceMeters }} 公尺）</span>
            </div>
          </div>

          <div
            id="gmap-container"
            class="gmap-container"
          ></div>

          <!-- Print Page 1 Footer (Visible only in Print / PDF) -->
          <div class="print-only print-page-footer print-page1-footer">
            <span>逢甲大學智慧校園生活導航系統 · Feng Chia University Campus Navigation</span>
            <span>【第 1 頁 / 共 2 頁 · 校園地圖導航】</span>
            <span>列印時間：{{ new Date().toLocaleString() }}</span>
          </div>

          <!-- Map loading overlay -->
          <div v-if="mapsLoading" class="route-loading-overlay">
            <div class="loading-spinner"></div>
            <span>{{ t('common.loading') }}</span>
          </div>

          <!-- Route loading overlay -->
          <div v-else-if="routeLoading" class="route-loading-overlay">
            <div class="loading-spinner"></div>
            <span>正在計算最佳路線...</span>
          </div>
        </div>

        <!-- 2. CARDS SECTION (Page 2 in A4 Print) -->
        <div
          v-if="currentMode === 'walking' && routeReady && !mapsError"
          class="cards-section-wrap"
        >
          <!-- Print Page 2 Header (Visible only in Print / PDF) -->
          <div class="print-only print-page-header print-page2-header">
            <div class="print-header-main">
              <span class="print-badge">FCU CAMPUS GUIDE</span>
              <h2 class="print-title">📋 導航詳細指引與大樓設施資訊 · Navigation & Facilities</h2>
            </div>
            <div class="print-header-meta">
              <span class="print-meta-route">🎯 目的地：{{ buildingLabel(destBuilding) }}</span>
              <span v-if="routeInfo" class="print-meta-stat">🚩 出發地：{{ buildingLabel(originBuilding) }}</span>
            </div>
          </div>

          <div
            class="walking-layout-grid"
            :class="{ 'has-events': buildingEvents.length > 0, 'no-events': buildingEvents.length === 0 }"
          >
            <!-- 1. Turn-by-Turn Steps Card (Left) -->
            <div class="card nav-equal-card steps-card">
              <div class="card-header-sticky">
                <h3>🚶 {{ t('nav.walkingSteps') }}</h3>
              </div>
              <div class="card-scroll-body">
                <ol class="steps-list">
                  <li v-for="step in walkingSteps" :key="step.index" class="step-item">
                    <span class="step-instruction" v-html="step.instruction"></span>
                    <span v-if="step.instructionZh && locale !== 'zh-TW'" class="step-instruction-zh" v-html="step.instructionZh"></span>
                    <span class="step-meta">{{ step.distance }} · {{ step.duration }}</span>
                  </li>
                </ol>
              </div>
            </div>

            <!-- 2. Active Events & Exams Info Card (Middle - Shown if building has events) -->
            <div v-if="buildingEvents.length > 0" class="card nav-equal-card events-card">
              <div class="card-header-sticky events-header-sticky">
                <div class="events-header-title-wrap">
                  <h3>📅 {{ btName(destBuilding) }}</h3>
                  <span class="events-count-badge">🏷️ {{ locale === 'zh-TW' ? `即時活動／考場 (${buildingEvents.length} 則)` : `Events & Exams (${buildingEvents.length})` }}</span>
                </div>
              </div>
              <div class="card-scroll-body">
                <div class="events-info-list">
                  <div v-for="event in buildingEvents" :key="event.id" class="nav-event-item">
                    <div class="nav-event-top">
                      <h4 class="nav-event-title">{{ event.title }}</h4>
                      <span class="nav-event-badge" :class="eventTypeBadge(event.type).class">
                        {{ eventTypeBadge(event.type).text }}
                      </span>
                    </div>

                    <div class="nav-event-time">
                      <span class="time-icon">⏰</span>
                      <span>{{ formatEventTime(event) }}</span>
                    </div>

                    <div v-if="event.location_text" class="nav-event-location">
                      <span class="loc-icon">📍</span>
                      <div class="loc-details">
                        <strong class="loc-label">{{ locale === 'zh-TW' ? '舉辦地點／考場：' : 'Location / Room:' }}</strong>
                        <p class="loc-text">{{ event.location_text }}</p>
                      </div>
                    </div>

                    <p v-if="event.description" class="nav-event-desc">
                      {{ event.description }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. Building Info & Facilities Card (Right) -->
            <div v-if="destBuilding && !store.destinationIsGate" class="card nav-equal-card info-card">
              <div class="card-scroll-body">
                <FacilityPanel :building="destBuilding" />
              </div>
            </div>
          </div>

          <!-- Print Page 2 Footer (Visible only in Print / PDF) -->
          <div class="print-only print-page-footer print-page2-footer">
            <span>逢甲大學智慧校園生活導航系統 · Feng Chia University Campus Navigation</span>
            <span>【第 2 頁 / 共 2 頁 · 設施與路線詳情】</span>
            <span>列印時間：{{ new Date().toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- DEDICATED 2-PAGE A4 PDF EXPORT TEMPLATE (Rendered for PDF)    -->
    <!-- ============================================================= -->
    <div
      v-if="isPdfGenerating"
      id="fcu-pdf-export-root"
      class="fcu-pdf-export-root"
    >
      <!-- PAGE 1: Campus Map Only -->
      <div id="fcu-pdf-page-1" class="fcu-pdf-page">
        <div class="fcu-pdf-header">
          <div class="pdf-h-top">
            <span class="pdf-fcu-badge">FCU CAMPUS GUIDE</span>
            <span class="pdf-doc-tag">校園導航指南 · Campus Navigation Guide</span>
          </div>
          <h1 class="pdf-h-title">逢甲大學智慧校園生活導航</h1>
          <div class="pdf-route-banner">
            <div class="pdf-route-endpoints">
              <span class="pdf-origin-text">🚩 起點：<strong>{{ buildingLabel(originBuilding) }}</strong></span>
              <span class="pdf-arrow-icon">➔</span>
              <span class="pdf-dest-text">🎯 目的地：<strong>{{ buildingLabel(destBuilding) }}</strong></span>
            </div>
            <div v-if="routeInfo" class="pdf-route-stat-pill">
              🚶 預估步行：約 {{ routeInfo.durationMinutes }} 分鐘（{{ routeInfo.distanceMeters }} 公尺）
            </div>
          </div>
        </div>

        <div class="fcu-pdf-map-container">
          <div id="pdf-dedicated-map" class="pdf-dedicated-map"></div>
        </div>

        <div class="fcu-pdf-footer">
          <span>逢甲大學智慧校園生活導航系統 · Feng Chia University</span>
          <span>【 第 1 頁 / 共 2 頁 · 校園地圖導航 】</span>
          <span>產出時間：{{ new Date().toLocaleString() }}</span>
        </div>
      </div>

      <!-- PAGE 2: Walking Route (Turn-by-Turn) Page -->
      <div id="fcu-pdf-page-2" class="fcu-pdf-page">
        <div class="fcu-pdf-header">
          <div class="pdf-h-top">
            <span class="pdf-fcu-badge">FCU CAMPUS GUIDE</span>
            <span class="pdf-doc-tag">步行路線指引 · Walking Route & Directions</span>
          </div>
          <h1 class="pdf-h-title">🚶 步行路線導航指引（Turn-by-Turn）</h1>
          <div class="pdf-route-banner">
            <div class="pdf-route-endpoints">
              <span class="pdf-origin-text">🚩 起點：<strong>{{ buildingLabel(originBuilding) }}</strong></span>
              <span class="pdf-arrow-icon">➔</span>
              <span class="pdf-dest-text">🎯 目的地：<strong>{{ buildingLabel(destBuilding) }}</strong></span>
            </div>
            <div v-if="routeInfo" class="pdf-route-stat-pill">
              🚶 預估步行：約 {{ routeInfo.durationMinutes }} 分鐘（{{ routeInfo.distanceMeters }} 公尺）
            </div>
          </div>
        </div>

        <!-- Full-Page Route Breakdown & Turn-by-Turn List -->
        <div class="fcu-pdf-route-fullpage">
          <!-- Route Summary Metrics Row -->
          <div class="pdf-route-summary-bar">
            <div class="pdf-summary-col">
              <span class="pdf-sum-label">🚩 出發起點</span>
              <strong class="pdf-sum-val">{{ buildingLabel(originBuilding) }}</strong>
            </div>
            <div class="pdf-summary-col">
              <span class="pdf-sum-label">📏 總步行距離</span>
              <strong class="pdf-sum-val">{{ routeInfo ? routeInfo.distanceMeters + ' 公尺' : '--' }}</strong>
            </div>
            <div class="pdf-summary-col">
              <span class="pdf-sum-label">⏱️ 預估步行時間</span>
              <strong class="pdf-sum-val">{{ routeInfo ? '約 ' + routeInfo.durationMinutes + ' 分鐘' : '--' }}</strong>
            </div>
            <div class="pdf-summary-col">
              <span class="pdf-sum-label">🎯 抵達目的地</span>
              <strong class="pdf-sum-val">{{ buildingLabel(destBuilding) }}</strong>
            </div>
          </div>

          <!-- Step-by-Step Walking Directions -->
          <div class="pdf-steps-fullcard">
            <div class="pdf-steps-fullcard-header">
              <h3>🚶 逐步導航指引清單</h3>
              <span class="pdf-steps-count">共 {{ walkingSteps.length }} 個指引步驟</span>
            </div>
            <div class="pdf-steps-fullcard-body">
              <div
                v-for="(step, idx) in walkingSteps"
                :key="step.index || idx"
                class="pdf-route-step-row"
              >
                <div class="pdf-step-num-badge">
                  {{ idx + 1 }}
                </div>
                <div class="pdf-step-content">
                  <div class="pdf-step-main-text" v-html="step.instruction"></div>
                  <div v-if="step.instructionZh && locale !== 'zh-TW'" class="pdf-step-zh-text" v-html="step.instructionZh"></div>
                  <div class="pdf-step-meta-tag">
                    <span>📏 {{ step.distance }}</span>
                    <span>⏱️ {{ step.duration }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Destination Arrival Box -->
          <div class="pdf-arrival-card">
            <div class="pdf-arrival-header">
              <span class="pdf-arrival-flag">🏁</span>
              <div>
                <strong>抵達目的地：{{ buildingLabel(destBuilding) }}</strong>
                <p v-if="destBuilding.roomCode">教室編碼範例：例如「{{ destBuilding.roomCode }}207」代表本棟大樓 2 樓 207 教室</p>
              </div>
            </div>
            <div v-if="buildingEvents.length > 0" class="pdf-arrival-events-hint">
              📅 <strong>今日活動／考場提醒：</strong>
              <span v-for="e in buildingEvents" :key="e.id" class="pdf-arrival-event-item">
                [{{ eventTypeBadge(e.type).text }}] {{ e.title }}（{{ e.location_text || '本大樓' }}）
              </span>
            </div>
          </div>
        </div>

        <div class="fcu-pdf-footer">
          <span>逢甲大學智慧校園生活導航系統 · Feng Chia University</span>
          <span>【 第 2 頁 / 共 2 頁 · 步行路線指引 】</span>
          <span>產出時間：{{ new Date().toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- Actions bar -->
    <div class="nav-actions-bar">
      <button
        v-if="currentMode === 'walking' && routeReady"
        type="button"
        class="btn pdf-btn"
        :disabled="isPdfGenerating"
        @click="exportPdf"
      >
        {{ isPdfGenerating ? '⏳ 正在產生 2 頁 A4 PDF...' : t('nav.exportPdf') }}
      </button>
      <button type="button" class="btn ghost" @click="planAnother">
        {{ currentMode === 'driving' ? t('common.restart') : t('arrival.planAnother') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.google-map-nav {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.25rem 1rem 3.5rem;
  box-sizing: border-box;
}

.nav-top-bar {
  display: flex;
  align-items: center;
  width: 100%;
}
.back-link-btn {
  background: rgba(129, 27, 41, 0.08);
  border: 1px solid rgba(129, 27, 41, 0.2);
  color: var(--fcu-maroon);
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.back-link-btn:hover {
  background: var(--fcu-maroon);
  color: #fff;
}

.empty-dest-card {
  text-align: center;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
.empty-dest-text {
  font-size: 1.1rem;
  color: var(--text-muted);
  margin: 0;
}

/* ---- Header sticker ---- */
.nav-hero {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 0.25rem 0;
}
.nav-hero-sticker {
  height: clamp(110px, 16vw, 150px);
  width: auto;
  max-width: 100%;
  object-fit: contain;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.25));
  display: block;
}
.sticker-driving {
  animation: car-drive 1.2s ease-in-out infinite, car-vibe 0.25s ease-in-out infinite alternate;
  transform-origin: bottom center;
}
.sticker-walking {
  animation: deer-walk 1.8s ease-in-out infinite;
  transform-origin: bottom center;
}
.sticker-finish {
  animation: sticker-pop 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes car-drive {
  0% {
    transform: translateY(0px) rotate(0deg) scale(1);
  }
  20% {
    transform: translateY(-6px) rotate(-1.5deg) scale(1.02) translateX(2px);
  }
  40% {
    transform: translateY(2px) rotate(0.8deg) scale(0.99);
  }
  60% {
    transform: translateY(-5px) rotate(-1deg) scale(1.01) translateX(-2px);
  }
  80% {
    transform: translateY(2px) rotate(0.5deg) scale(0.99);
  }
  100% {
    transform: translateY(0px) rotate(0deg) scale(1);
  }
}

@keyframes car-vibe {
  0% {
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.25));
  }
  100% {
    filter: drop-shadow(0 12px 22px rgba(129, 27, 41, 0.35));
  }
}

@keyframes deer-walk {
  0%, 100% {
    transform: translateX(-12px) translateY(0px) rotate(-2deg);
  }
  25% {
    transform: translateX(0px) translateY(-5px) rotate(0deg);
  }
  50% {
    transform: translateX(12px) translateY(0px) rotate(2deg);
  }
  75% {
    transform: translateX(0px) translateY(-5px) rotate(0deg);
  }
}

@keyframes deer-sway {
  0%, 100% {
    transform: translateX(-14px) rotate(-2deg);
  }
  50% {
    transform: translateX(14px) rotate(2deg);
  }
}

@keyframes sticker-pop {
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

/* ---- Loading & Error ---- */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 1.1rem;
}
.loading-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid var(--border);
  border-top-color: var(--fcu-maroon);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.error-card {
  text-align: center;
  padding: 1.5rem;
}
.error-text {
  color: #c0392b;
  font-weight: 600;
  font-size: 1.05rem;
  margin: 0 0 1rem;
}

/* ---- Driving UI ---- */
.driving-ui {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  background: var(--surface, #fff);
  border-radius: var(--radius, 16px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  padding: 1.5rem;
}
.driving-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.75rem;
}
.driving-header h2 {
  margin: 0;
  color: var(--fcu-maroon-dark);
  font-size: 1.35rem;
}
.driving-mode-badge {
  background: rgba(0, 107, 147, 0.1);
  color: var(--fcu-blue-dark);
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
}
.driving-info-row {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  background: #fdfbf7;
  border: 1px solid #f0e6d6;
  border-radius: 12px;
  padding: 1rem 1.25rem;
}
.driving-dest,
.driving-parking {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.dest-highlight {
  font-size: 1.15rem;
  color: var(--fcu-maroon-dark);
}
.parking-highlight {
  font-size: 1.15rem;
  color: var(--fcu-blue-dark);
}
.label-muted {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 600;
}
.distance-note {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.driving-origin-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.driving-origin-field label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}
.input-with-button {
  display: flex;
  gap: 0.75rem;
  width: 100%;
}
.input-with-button input {
  flex: 1;
  padding: 0.75rem 1rem;
  font-size: 1.05rem;
  border: 1.5px solid var(--border);
  border-radius: 10px;
}
.driving-start-btn {
  padding: 0.75rem 1.75rem;
  font-size: 1.05rem;
  font-weight: 700;
  white-space: nowrap;
}
.driving-links-row {
  display: flex;
  gap: 0.75rem;
}
.btn-loading {
  margin-right: 0.3em;
}

/* ---- Deer Prompt ---- */
.deer-prompt {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.1rem 1.5rem;
  cursor: pointer;
  background: linear-gradient(135deg, #fff9f5 0%, #ffece3 100%);
  border: 2px solid var(--fcu-maroon-light);
  border-radius: 14px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 14px rgba(129, 27, 41, 0.12);
  margin-top: 0.5rem;
}
.deer-prompt:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(129, 27, 41, 0.22);
}
.prompt-deer {
  width: 75px;
  height: auto;
  flex-shrink: 0;
  animation: deer-sway 2.4s ease-in-out infinite;
}
.prompt-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.prompt-main {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--fcu-maroon-dark);
}
.prompt-hint {
  margin: 0;
  font-size: 0.95rem;
  color: var(--fcu-blue-dark);
  font-weight: 600;
}
.prompt-fade-enter-active { animation: prompt-slide-in 0.5s ease; }
.prompt-fade-leave-active { animation: prompt-slide-in 0.3s ease reverse; }
@keyframes prompt-slide-in {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ---- Route summary bar ---- */
.route-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.85rem 1.25rem;
}
.route-summary-stats {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.route-stat {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--fcu-maroon-dark);
}
.open-gmaps-btn {
  flex-shrink: 0;
}

/* ---- Capture wrapper (Map + Bottom Cards together) ---- */
.nav-capture-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
}

/* ---- Map Section (地圖最大在上方) ---- */
.map-section-wrap {
  width: 100%;
  position: relative;
}
.gmap-container {
  width: 100%;
  height: 440px;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius, 16px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  background: #f3ede1;
  z-index: 1;
}
.route-loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  background: rgba(255, 255, 255, 0.95);
  padding: 1rem 1.75rem;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
  color: var(--fcu-maroon-dark);
}

/* ---- Bottom Grid: Equal Height & Width Cards ---- */
.walking-layout-grid {
  display: grid;
  gap: 1.5rem;
  width: 100%;
  align-items: stretch;
}
.walking-layout-grid.has-events {
  grid-template-columns: repeat(3, 1fr);
}
.walking-layout-grid.no-events {
  grid-template-columns: 1fr 1fr;
}

.nav-equal-card {
  height: 490px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  background: var(--surface, #fff);
  border-radius: var(--radius, 16px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.card-header-sticky {
  padding: 1rem 1.25rem 0.85rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface, #fff);
  flex-shrink: 0;
}
.card-header-sticky h3 {
  margin: 0;
  color: var(--fcu-maroon-dark);
  font-size: 1.15rem;
  font-weight: 700;
}

.events-header-sticky {
  padding: 0.9rem 1.25rem 0.8rem;
  background: #fdfbf7;
  border-bottom: 1px solid #f0e6d6;
}
.events-header-title-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  width: 100%;
}
.events-header-title-wrap h3 {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
  color: var(--fcu-maroon-dark);
  line-height: 1.35;
}
.events-count-badge {
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
  background: rgba(129, 27, 41, 0.08);
  color: var(--fcu-maroon-dark);
  border: 1px solid rgba(129, 27, 41, 0.22);
  padding: 0.18rem 0.6rem;
  border-radius: 6px;
  line-height: 1.2;
}

.card-scroll-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 1.25rem;
}

.steps-list {
  margin: 0;
  padding-left: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.step-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.98rem;
  line-height: 1.5;
}
.step-instruction {
  color: var(--text);
}
.step-instruction :deep(b) {
  color: var(--fcu-maroon-dark);
}
.step-instruction-zh {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 500;
  opacity: 0.88;
}
.step-meta {
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* ---- Event Item Inside Middle Card ---- */
.events-info-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.nav-event-item {
  background: #faf8f5;
  border: 1.5px solid #ece4d8;
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.nav-event-top {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  width: 100%;
}
.nav-event-title {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 700;
  color: var(--fcu-maroon-dark);
  line-height: 1.4;
  word-break: break-word;
}
.nav-event-badge {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.2em 0.65em;
  border-radius: 6px;
  align-self: flex-start;
  white-space: nowrap;
  line-height: 1.2;
}
.type-exam {
  background: #e74c3c;
  color: #fff;
}
.type-lecture {
  background: var(--fcu-blue-dark);
  color: #fff;
}
.type-recruit {
  background: #27ae60;
  color: #fff;
}
.type-activity {
  background: var(--fcu-gold);
  color: var(--fcu-maroon-dark);
}
.type-other {
  background: var(--text-muted);
  color: #fff;
}
.nav-event-time {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}
.time-icon {
  font-size: 0.95rem;
}
.nav-event-location {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  background: #fff;
  border: 1px solid #e8dfd3;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  font-size: 0.9rem;
}
.loc-icon {
  font-size: 0.95rem;
}
.loc-details {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.loc-label {
  color: var(--fcu-maroon-dark);
  font-size: 0.85rem;
}
.loc-text {
  margin: 0;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}
.nav-event-desc {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ---- Actions bar ---- */
.nav-actions-bar {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
  padding-top: 0.5rem;
}
.screenshot-btn {
  font-size: 1.05rem;
}

/* ---- Responsive ---- */
@media (max-width: 900px) {
  .walking-layout-grid.has-events {
    grid-template-columns: 1fr;
  }
  .walking-layout-grid.no-events {
    grid-template-columns: 1fr;
  }
  .nav-equal-card {
    height: auto;
    max-height: 450px;
  }
  .gmap-container {
    height: 330px;
  }
  .input-with-button {
    flex-direction: column;
  }
}
@media (max-width: 640px) {
  .google-map-nav {
    padding: 0.75rem 0.75rem 2rem;
  }
  .driving-info-row {
    flex-direction: column;
    gap: 0.5rem;
  }
  .deer-prompt {
    flex-direction: column;
    text-align: center;
  }
  .route-summary {
    flex-direction: column;
    align-items: flex-start;
  }
  .gmap-container {
    height: 290px;
  }
}

/* ---- Normal Content Layout (Map on TOP, 3 equal Cards on BOTTOM) ---- */
.nav-content-layout {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.print-only {
  display: none !important;
}

.pdf-btn {
  background: var(--fcu-maroon, #811b29) !important;
  color: #fff !important;
  font-size: 1.05rem !important;
  font-weight: 700 !important;
  padding: 0.65rem 1.4rem !important;
  border-radius: 999px !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  box-shadow: 0 4px 14px rgba(129, 27, 41, 0.35) !important;
  cursor: pointer;
  transition: all 0.2s ease;
}
.pdf-btn:hover {
  background: #6a1521 !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(129, 27, 41, 0.45) !important;
}

/* ========================================================================== */
/* ---- DEDICATED 2-PAGE A4 PDF EXPORT TEMPLATE STYLES                   ---- */
/* ========================================================================== */
.fcu-pdf-export-root {
  position: fixed;
  left: 0;
  top: 0;
  width: 1000px;
  background: #ffffff;
  z-index: -9999;
  opacity: 0.001;
  pointer-events: none;
}

.fcu-pdf-page {
  width: 1000px;
  height: 1414px; /* Exact A4 aspect ratio 1:1.414 */
  background: #ffffff;
  padding: 36px 42px 30px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-bottom: 30px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
  color: #222;
}

.fcu-pdf-header {
  border-bottom: 3px solid #811b29;
  padding-bottom: 14px;
}
.pdf-h-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.pdf-fcu-badge {
  background: #811b29;
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}
.pdf-doc-tag {
  font-size: 13px;
  font-weight: 700;
  color: #811b29;
}
.pdf-h-title {
  margin: 4px 0 10px;
  font-size: 26px;
  font-weight: 800;
  color: #811b29;
}
.pdf-route-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #faf7f2;
  border: 1.5px solid #ece4d6;
  border-radius: 8px;
  padding: 8px 16px;
}
.pdf-route-endpoints {
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.pdf-arrow-icon {
  color: #811b29;
  font-weight: 800;
}
.pdf-route-stat-pill {
  font-size: 14px;
  font-weight: 700;
  color: #811b29;
  background: rgba(129, 27, 41, 0.08);
  padding: 4px 12px;
  border-radius: 20px;
}

/* Page 1 Map Container (Native Leaflet Portrait Instance) */
.fcu-pdf-map-container {
  width: 100%;
  height: 1100px;
  margin: 16px 0;
  border: 2.5px solid #811b29;
  border-radius: 14px;
  overflow: hidden;
  background: #fbf9f6;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  position: relative;
}
.pdf-dedicated-map {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}
/* Page 2 Walking Route Full-Page Layout */
.fcu-pdf-route-fullpage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 16px 0;
  flex: 1 1 auto;
}

.pdf-route-summary-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  background: #fdfbf7;
  border: 1.5px solid #ece3d4;
  border-radius: 10px;
  padding: 12px 16px;
}
.pdf-summary-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pdf-sum-label {
  font-size: 11.5px;
  color: #777;
  font-weight: 600;
}
.pdf-sum-val {
  font-size: 14.5px;
  color: #811b29;
  font-weight: 700;
}

/* Steps Full Card */
.pdf-steps-fullcard {
  border: 1.5px solid #e2d8ca;
  border-radius: 12px;
  background: #faf8f5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1 1 auto;
}
.pdf-steps-fullcard-header {
  background: #f3ece0;
  padding: 12px 18px;
  border-bottom: 1.5px solid #e2d8ca;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pdf-steps-fullcard-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #811b29;
}
.pdf-steps-count {
  font-size: 12.5px;
  font-weight: 700;
  color: #811b29;
  background: rgba(129, 27, 41, 0.08);
  padding: 3px 10px;
  border-radius: 20px;
}

.pdf-steps-fullcard-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
}

.pdf-route-step-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: #ffffff;
  border: 1px solid #ebdfcd;
  border-radius: 10px;
  padding: 12px 16px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
}

.pdf-step-num-badge {
  width: 28px;
  height: 28px;
  background: #811b29;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
  margin-top: 2px;
}

.pdf-step-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}

.pdf-step-main-text {
  font-size: 14.5px;
  font-weight: 600;
  color: #222;
  line-height: 1.45;
}
.pdf-step-main-text :deep(b) {
  color: #811b29;
}

.pdf-step-zh-text {
  font-size: 12px;
  color: #666;
}

.pdf-step-meta-tag {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #777;
  font-weight: 600;
  margin-top: 2px;
}

/* Destination Arrival Box */
.pdf-arrival-card {
  background: #fcfaf6;
  border: 1.5px solid #d9ccb8;
  border-radius: 10px;
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pdf-arrival-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pdf-arrival-flag {
  font-size: 20px;
}
.pdf-arrival-header strong {
  font-size: 15px;
  color: #811b29;
}
.pdf-arrival-header p {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: #555;
}
.pdf-arrival-events-hint {
  font-size: 12px;
  color: #333;
  background: rgba(129, 27, 41, 0.05);
  border-radius: 6px;
  padding: 6px 10px;
}
.pdf-arrival-event-item {
  margin-left: 6px;
  color: #811b29;
  font-weight: 600;
}

.fcu-pdf-footer {
  border-top: 1px solid #ccc;
  padding-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #777;
}

/* ========================================================================== */
/* ---- 2-PAGE A4 NATIVE VECTOR PRINT & PDF STYLESHEET                    ---- */
/* ========================================================================== */
@media print {
  @page {
    size: A4 portrait;
    margin: 10mm 12mm;
  }

  body, html {
    background: #fff !important;
    color: #111 !important;
    font-size: 10pt !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Hide screen interactive elements */
  .app-header,
  .nav-top-bar,
  .nav-actions-bar,
  .open-gmaps-btn,
  .language-switcher,
  .back-link-btn,
  .photo-zoom-hint,
  .leaflet-control-zoom,
  .leaflet-control-attribution,
  .deer-prompt,
  .lightbox-overlay,
  .b4-capture-header,
  .b4-capture-footer,
  .route-summary {
    display: none !important;
  }

  .google-map-nav {
    padding: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    gap: 0 !important;
  }

  .nav-capture-wrapper {
    background: #fff !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .nav-content-layout {
    display: block !important;
    width: 100% !important;
  }

  /* Show Print Headers & Footers */
  .print-only {
    display: flex !important;
  }

  .print-page-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    border-bottom: 2.5px solid #811b29 !important;
    padding-bottom: 0.5rem !important;
    margin-bottom: 0.75rem !important;
    width: 100% !important;
  }
  .print-header-main {
    display: flex !important;
    align-items: center !important;
    gap: 0.6rem !important;
  }
  .print-badge {
    background: #811b29 !important;
    color: #fff !important;
    font-weight: 800 !important;
    font-size: 0.8rem !important;
    padding: 0.2rem 0.55rem !important;
    border-radius: 4px !important;
  }
  .print-title {
    margin: 0 !important;
    font-size: 1.2rem !important;
    color: #811b29 !important;
    font-weight: 800 !important;
  }
  .print-header-meta {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    gap: 0.2rem !important;
    font-size: 0.88rem !important;
  }
  .print-meta-route {
    font-weight: 700 !important;
    color: #811b29 !important;
  }
  .print-meta-stat {
    color: #444 !important;
    font-weight: 600 !important;
  }

  .print-page-footer {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    border-top: 1px solid #ccc !important;
    padding-top: 0.4rem !important;
    margin-top: 0.6rem !important;
    font-size: 0.78rem !important;
    color: #666 !important;
    width: 100% !important;
  }

  /* ====== PAGE 1: FULL-PAGE CAMPUS MAP ====== */
  .map-section-wrap {
    page-break-after: always !important;
    break-after: page !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    height: 94vh !important;
    max-height: 94vh !important;
    box-sizing: border-box !important;
    padding-bottom: 0.5rem !important;
  }

  .gmap-container {
    flex: 1 1 auto !important;
    height: 78vh !important;
    min-height: 580px !important;
    width: 100% !important;
    border: 2px solid #811b29 !important;
    border-radius: 12px !important;
    box-shadow: none !important;
    break-inside: avoid !important;
  }

  /* ====== PAGE 2: INFORMATION & DIRECTIONS ====== */
  .cards-section-wrap {
    page-break-before: always !important;
    break-before: page !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 94vh !important;
    justify-content: space-between !important;
    box-sizing: border-box !important;
    padding-top: 0.5rem !important;
    gap: 0.75rem !important;
  }

  .walking-layout-grid {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 1rem !important;
    align-items: start !important;
    flex: 1 1 auto !important;
  }
  .walking-layout-grid.no-events {
    grid-template-columns: 1fr 1fr !important;
  }

  .nav-equal-card {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    border: 1.5px solid #d0c5b5 !important;
    border-radius: 10px !important;
    background: #faf8f5 !important;
    break-inside: avoid !important;
    box-shadow: none !important;
  }

  .card-scroll-body {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 0.75rem 0.9rem !important;
  }

  .facility-photo {
    height: 180px !important;
  }
}
</style>
