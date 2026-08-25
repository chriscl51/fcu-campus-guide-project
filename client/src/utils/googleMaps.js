// Leaflet map loader — free, no API key needed.
// Uses OpenStreetMap tiles + OSRM for routing.
let leafletReady = null

export function loadLeaflet() {
  if (leafletReady) return leafletReady

  leafletReady = new Promise((resolve, reject) => {
    // Already loaded
    if (window.L) {
      resolve(window.L)
      return
    }

    // Load Leaflet CSS
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    css.crossOrigin = ''
    document.head.appendChild(css)

    // Load Leaflet JS
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => resolve(window.L)
    script.onerror = () => {
      leafletReady = null
      reject(new Error('Failed to load Leaflet'))
    }
    document.head.appendChild(script)
  })

  return leafletReady
}

const ROUTING_ENDPOINTS = {
  foot: [
    'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
    'https://router.project-osrm.org/route/v1/foot',
  ],
  car: [
    'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    'https://router.project-osrm.org/route/v1/driving',
  ],
}

const CAMPUS_STREETS = {
  '榕樹大道': {
    en: 'Banyan Promenade',
    ja: '榕樹大道 (Banyan Promenade)',
    ko: '반얀 대도 (Banyan Promenade)',
    vi: 'Đại lộ Banyan',
    id: 'Banyan Promenade',
    th: 'ถนนต้นไทร (Banyan Promenade)',
  },
  '校園步道': {
    en: 'Campus Walkway',
    ja: 'キャンパス歩道',
    ko: '캠퍼스 산책로',
    vi: 'Lối đi bộ khuôn viên',
    id: 'Jalur Pejalan Kaki Kampus',
    th: 'ทางเดินเท้าในมหาวิทยาลัย',
  },
  '文華路': {
    en: 'Wenhua Rd.',
    ja: '文華路 (Wenhua Rd.)',
    ko: '원화로 (Wenhua Rd.)',
    vi: 'Đường Wenhua',
    id: 'Jl. Wenhua',
    th: 'ถนน Wenhua',
  },
  '逢大路': {
    en: 'Fengda Rd.',
    ja: '逢大路 (Fengda Rd.)',
    ko: '펑达로 (Fengda Rd.)',
    vi: 'Đường Fengda',
    id: 'Jl. Fengda',
    th: 'ถนน Fengda',
  },
  '福星路': {
    en: 'Fuxing Rd.',
    ja: '福星路 (Fuxing Rd.)',
    ko: '푸싱로 (Fuxing Rd.)',
    vi: 'Đường Fuxing',
    id: 'Jl. Fuxing',
    th: 'ถนน Fuxing',
  },
  '逢甲路': {
    en: 'Fengjia Rd.',
    ja: '逢甲路 (Fengjia Rd.)',
    ko: '펑자뤄 (Fengjia Rd.)',
    vi: 'Đường Fengjia',
    id: 'Jl. Fengjia',
    th: 'ถนน Fengjia',
  },
  '河南路': {
    en: 'Henan Rd.',
    ja: '河南路 (Henan Rd.)',
    ko: '허난로 (Henan Rd.)',
    vi: 'Đường Henan',
    id: 'Jl. Henan',
    th: 'ถนน Henan',
  },
  '西安街': {
    en: 'Xi’an St.',
    ja: '西安街 (Xi’an St.)',
    ko: '시안가 (Xi’an St.)',
    vi: 'Phố Xi’an',
    id: 'Jl. Xi’an',
    th: 'ถนน Xi’an',
  },
}

// The one stretch of campus path that's actually allowed to be labeled
// "榕樹大道 (Banyan Promenade)" — a real, named path, confirmed on-site.
// [lat, lon] polygon, same winding/format as noCrossingZones.js. Any graph
// edge whose name says Banyan Promenade but whose geometry falls outside
// this polygon is mislabeled (the surrounding CAMPUS_GRAPH_EDGES topology is
// a coarse ~30-node approximation, not a surveyed path network, so an edge
// can be forced through this label even when the real walk it represents is
// elsewhere, e.g. along the west perimeter wall) — see resolveEdgeName().
const BANYAN_PROMENADE_ZONE = [
  [24.178977511630222, 120.64670977665287],
  [24.178813569223998, 120.64674732759823],
  [24.17875239663018, 120.64799991918254],
  [24.17906804689728, 120.64798919034705],
  [24.17897995852919, 120.64801601243579],
  [24.17913166623642, 120.6490137940415],
  [24.179004427526436, 120.64905939158992],
]

const BANYAN_PROMENADE_NAME = '榕樹大道 (Banyan Promenade)'
const CAMPUS_WALKWAY_NAME = '校園步道 (Campus Walkway)'

/** Gate the Banyan Promenade label on real geometry: only keep it when the
 * edge's midpoint actually falls inside BANYAN_PROMENADE_ZONE, otherwise
 * fall back to the generic campus-walkway label. Any other name passes
 * through unchanged. */
function resolveEdgeName(rawName, uNode, vNode) {
  if (rawName !== BANYAN_PROMENADE_NAME) return rawName
  const midLat = (uNode.lat + vNode.lat) / 2
  const midLon = (uNode.lon + vNode.lon) / 2
  return isPointInsidePolygon(midLat, midLon, BANYAN_PROMENADE_ZONE) ? rawName : CAMPUS_WALKWAY_NAME
}

function translateStreet(name, locale) {
  if (!name || locale === 'zh-TW') return name
  for (const [zhKey, translations] of Object.entries(CAMPUS_STREETS)) {
    if (name.includes(zhKey)) {
      const trans = translations[locale] || translations.en
      return trans ? name.replace(zhKey, trans) : name
    }
  }
  return name
}

export function isInsideCampus(lat, lon) {
  return lat >= 24.1770 && lat <= 24.1835 && lon >= 120.6450 && lon <= 120.6520
}

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000 // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Campus Walkway Graph (Accurate pedestrian network of Feng Chia University)
const CAMPUS_GRAPH_NODES = {
  // 南側步道 (西門到圖書館為榕樹大道，其餘為校園步道)
  'w_gate': { id: 'w_gate', nameZh: '西門（大門口）', nameEn: 'West Gate', nameJa: '西門', lat: 24.178848, lon: 120.646538 },
  'adb_1': { id: 'adb_1', nameZh: '行政大樓', nameEn: 'Administration Building', nameJa: '行政大楼', lat: 24.178694, lon: 120.647002 },
  'adb_2': { id: 'adb_2', nameZh: '行政二館', nameEn: 'Administration Building II', nameJa: '行政第二棟', lat: 24.178756, lon: 120.647635 },
  'cmb': { id: 'cmb', nameZh: '丘逢甲紀念館', nameEn: 'Chiu Feng-Chia Memorial Hall', nameJa: '丘逢甲記念館', lat: 24.178465, lon: 120.648257 },
  'lib_cross': { id: 'lib_cross', nameZh: '圖書館前廣場', nameEn: 'Library Plaza', nameJa: '図書館前', lat: 24.178629, lon: 120.648613 },
  'sab': { id: 'sab', nameZh: '科學與航太館', nameEn: 'Science & Aero Building', nameJa: '科学航空館', lat: 24.178387, lon: 120.649308 },
  'bb': { id: 'bb', nameZh: '商學大樓', nameEn: 'Business Building', nameJa: '商学大楼', lat: 24.178538, lon: 120.649947 },
  'e_gate': { id: 'e_gate', nameZh: '東門', nameEn: 'East Gate', nameJa: '東門', lat: 24.178210, lon: 120.650194 },

  // 中央步道
  'egb_cross': { id: 'egb_cross', nameZh: '工學館東側步道口', nameEn: 'Engineering East Walkway', nameJa: '工学館東歩道', lat: 24.179099, lon: 120.648615 },
  'ryb': { id: 'ryb', nameZh: '人言大樓', nameEn: 'Jen-Yen Building', nameJa: '人言大楼', lat: 24.179534, lon: 120.648619 },
  'court_cross': { id: 'court_cross', nameZh: '球場前步道口', nameEn: 'Courts Walkway', nameJa: '球場歩道', lat: 24.180080, lon: 120.648620 },
  'af': { id: 'af', nameZh: '綜合運動場', nameEn: 'Athletic Field', nameJa: '総合運動場', lat: 24.180906, lon: 120.648689 },
  'sc_sp': { id: 'sc_sp', nameZh: '體育館／游泳池', nameEn: 'Sports Center & Pool', nameJa: '体育館／プール', lat: 24.181467, lon: 120.648863 },
  'n_gate': { id: 'n_gate', nameZh: '北門', nameEn: 'North Gate', nameJa: '北門', lat: 24.181900, lon: 120.648155 },

  // 西側通道
  'jcb': { id: 'jcb', nameZh: '忠勤樓', nameEn: 'Chung-Chin Building', nameJa: '忠勤楼', lat: 24.179042, lon: 120.647018 },
  'egb': { id: 'egb', nameZh: '工學館', nameEn: 'Engineering Building', nameJa: '工学館', lat: 24.179099, lon: 120.647881 },
  'ab_lb_rb': { id: 'ab_lb_rb', nameZh: '建築館／語文大樓／育樂館', nameEn: 'Architecture, Language & Recreation Buildings', nameJa: '建築館・語文館・育楽館', lat: 24.180018, lon: 120.646935 },
  'hh': { id: 'hh', nameZh: '第一招待所', nameEn: 'History House', nameJa: '第一招待所', lat: 24.179838, lon: 120.647612 },
  'chb_xsb_sb': { id: 'chb_xsb_sb', nameZh: '土木水利館／學思樓／理學大樓', nameEn: 'Civil, Xuesi & Science Buildings', nameJa: '土木水利館・学思楼・理学大楼', lat: 24.181227, lon: 120.646971 },
  'xsg': { id: 'xsg', nameZh: '學思園', nameEn: 'Xuesi Garden', nameJa: '学思園', lat: 24.181526, lon: 120.647582 },
  'wic': { id: 'wic', nameZh: '文華創意中心', nameEn: 'Wenhwa Innovation Center', nameJa: '文華創意センター', lat: 24.181541, lon: 120.646429 },

  // 東側通道
  'ieb_vh': { id: 'ieb_vh', nameZh: '資訊電機館／共善樓', nameEn: 'Information & General Building', nameJa: '資電館・共善楼', lat: 24.179135, lon: 120.649657 },
  'hsb_ecb_vc': { id: 'hsb_ecb_vc', nameZh: '人文社會館／電子通訊館／排球場', nameEn: 'Humanities, Telecom & Volleyball Court', nameJa: '人社館・電通館・バレーコート', lat: 24.179923, lon: 120.649512 },
  'bc_tc': { id: 'bc_tc', nameZh: '籃球場／網球場', nameEn: 'Basketball & Tennis Courts', nameJa: 'バスケ／テニスコート', lat: 24.180070, lon: 120.649298 },
  'vc': { id: 'vc', nameZh: '排球場', nameEn: 'Volleyball Court', nameJa: 'バレーボールコート', lat: 24.180243, lon: 120.649963 },
  'ih': { id: 'ih', nameZh: '逢甲智慧創新港', nameEn: 'iHub Innovation Port', nameJa: '智慧創新港', lat: 24.181951, lon: 120.649807 },

  // 荷花池環池步道節點 (Perimeter walkways around Lotus Pond)
  'pond_sw': { id: 'pond_sw', nameZh: '池塘西南側步道', nameEn: 'Pond SW Walkway', nameJa: '池南西歩道', lat: 24.178550, lon: 120.649280 },
  'pond_nw': { id: 'pond_nw', nameZh: '池塘西北側步道', nameEn: 'Pond NW Walkway', nameJa: '池北西歩道', lat: 24.179050, lon: 120.649280 },
  'pond_se': { id: 'pond_se', nameZh: '池塘東南側步道', nameEn: 'Pond SE Walkway', nameJa: '池南東歩道', lat: 24.178550, lon: 120.650200 },
  'pond_ne': { id: 'pond_ne', nameZh: '池塘東北側步道', nameEn: 'Pond NE Walkway', nameJa: '池北東歩道', lat: 24.179050, lon: 120.650200 },
}

const CAMPUS_GRAPH_EDGES = [
  // 榕樹大道（校內唯一有名字之道路：西門進入至圖書館前）
  ['w_gate', 'adb_1', '榕樹大道 (Banyan Promenade)'],
  ['adb_1', 'adb_2', '榕樹大道 (Banyan Promenade)'],
  ['adb_2', 'cmb', '榕樹大道 (Banyan Promenade)'],
  ['cmb', 'lib_cross', '榕樹大道 (Banyan Promenade)'],

  // 其餘校內所有步道一律標註為「校園步道 (Campus Walkway)」
  ['lib_cross', 'sab', '校園步道 (Campus Walkway)'],
  ['sab', 'bb', '校園步道 (Campus Walkway)'],
  ['bb', 'e_gate', '校園步道 (Campus Walkway)'],

  // 荷花池四周環池步道（四周一圈均可順暢通行，商學大樓 ↔ 資電館可直接走東側步道）
  ['sab', 'pond_sw', '校園步道 (Campus Walkway)'],
  ['pond_sw', 'pond_nw', '校園步道 (Campus Walkway)'],
  ['pond_nw', 'ieb_vh', '校園步道 (Campus Walkway)'],

  ['bb', 'pond_se', '校園步道 (Campus Walkway)'],
  ['pond_se', 'pond_ne', '校園步道 (Campus Walkway)'],
  ['pond_ne', 'ieb_vh', '校園步道 (Campus Walkway)'],

  ['lib_cross', 'egb_cross', '校園步道 (Campus Walkway)'],
  ['egb_cross', 'ryb', '校園步道 (Campus Walkway)'],
  ['ryb', 'court_cross', '校園步道 (Campus Walkway)'],
  ['court_cross', 'af', '校園步道 (Campus Walkway)'],
  ['af', 'sc_sp', '校園步道 (Campus Walkway)'],
  ['sc_sp', 'n_gate', '校園步道 (Campus Walkway)'],

  ['adb_1', 'jcb', '校園步道 (Campus Walkway)'],
  ['jcb', 'egb', '校園步道 (Campus Walkway)'],
  ['egb', 'egb_cross', '校園步道 (Campus Walkway)'],
  ['egb_cross', 'ieb_vh', '校園步道 (Campus Walkway)'],

  ['jcb', 'ab_lb_rb', '校園步道 (Campus Walkway)'],
  ['ab_lb_rb', 'hh', '校園步道 (Campus Walkway)'],
  ['hh', 'ryb', '校園步道 (Campus Walkway)'],
  ['ryb', 'hsb_ecb_vc', '校園步道 (Campus Walkway)'],
  ['ieb_vh', 'hsb_ecb_vc', '校園步道 (Campus Walkway)'],

  ['ab_lb_rb', 'chb_xsb_sb', '校園步道 (Campus Walkway)'],
  ['chb_xsb_sb', 'xsg', '校園步道 (Campus Walkway)'],
  ['xsg', 'af', '校園步道 (Campus Walkway)'],
  ['court_cross', 'bc_tc', '校園步道 (Campus Walkway)'],
  ['bc_tc', 'hsb_ecb_vc', '校園步道 (Campus Walkway)'],
  ['hsb_ecb_vc', 'vc', '校園步道 (Campus Walkway)'],
  ['vc', 'ih', '校園步道 (Campus Walkway)'],

  ['chb_xsb_sb', 'wic', '校園步道 (Campus Walkway)'],
  ['wic', 'n_gate', '校園步道 (Campus Walkway)'],
  ['xsg', 'n_gate', '校園步道 (Campus Walkway)'],
  ['af', 'sc_sp', '校園步道 (Campus Walkway)'],
  ['sc_sp', 'ih', '校園步道 (Campus Walkway)'],
]

import noCrossingZones from '../data/noCrossingZones.js'

export function isPointInsidePolygon(lat, lon, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0]
    const xj = polygon[j][1], yj = polygon[j][0]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export function isSegmentIntersectingSegment(p1, p2, p3, p4) {
  function ccw(A, B, C) {
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
  }
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4))
}

export function isEdgeCrossingNoCrossingZone(uLat, uLon, vLat, vLon) {
  const segP1 = [uLat, uLon]
  const segP2 = [vLat, vLon]

  for (const zone of noCrossingZones) {
    const coords = zone.coordinates
    if (isPointInsidePolygon(uLat, uLon, coords) || isPointInsidePolygon(vLat, vLon, coords)) {
      return true
    }
    for (let i = 0; i < coords.length; i++) {
      const p3 = coords[i]
      const p4 = coords[(i + 1) % coords.length]
      if (isSegmentIntersectingSegment(segP1, segP2, p3, p4)) {
        return true
      }
    }
  }
  return false
}

function findClosestCampusNode(lat, lon) {
  let closestId = null
  let minD = Infinity
  for (const [id, node] of Object.entries(CAMPUS_GRAPH_NODES)) {
    const d = haversineDistanceMeters(lat, lon, node.lat, node.lon)
    if (d < minD) {
      minD = d
      closestId = id
    }
  }
  return { id: closestId, distance: minD, node: CAMPUS_GRAPH_NODES[closestId] }
}

function solveCampusWalkwayRoute(from, to, locale = 'zh-TW') {
  const fromLon = from.lon ?? from.lng
  const fromLat = from.lat
  const toLon = to.lon ?? to.lng
  const toLat = to.lat

  const startNodeMatch = findClosestCampusNode(fromLat, fromLon)
  const targetNodeMatch = findClosestCampusNode(toLat, toLon)

  // Build adjacency list
  const adj = {}
  for (const id of Object.keys(CAMPUS_GRAPH_NODES)) {
    adj[id] = []
  }
  for (const [u, v, name] of CAMPUS_GRAPH_EDGES) {
    if (adj[u] && adj[v]) {
      const uNode = CAMPUS_GRAPH_NODES[u]
      const vNode = CAMPUS_GRAPH_NODES[v]
      // Dynamic No-Crossing Zone Obstacle Filter
      if (isEdgeCrossingNoCrossingZone(uNode.lat, uNode.lon, vNode.lat, vNode.lon)) {
        continue // Skip edge: blocked by No-Crossing Zone (e.g. Lotus Pond)
      }
      const dist = haversineDistanceMeters(uNode.lat, uNode.lon, vNode.lat, vNode.lon)
      adj[u].push({ to: v, dist, name })
      adj[v].push({ to: u, dist, name })
    }
  }

  // Dijkstra / A*
  const startId = startNodeMatch.id
  const targetId = targetNodeMatch.id

  const dists = { [startId]: 0 }
  const prev = {}
  const visited = new Set()
  const pq = [{ id: startId, cost: 0 }]

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost)
    const { id: curr } = pq.shift()
    if (curr === targetId) break
    if (visited.has(curr)) continue
    visited.add(curr)

    for (const edge of adj[curr] || []) {
      const newCost = dists[curr] + edge.dist
      if (dists[edge.to] == null || newCost < dists[edge.to]) {
        dists[edge.to] = newCost
        prev[edge.to] = { from: curr, name: edge.name, dist: edge.dist }
        pq.push({ id: edge.to, cost: newCost })
      }
    }
  }

  // Reconstruct path
  const pathNodeIds = []
  let curr = targetId
  while (curr) {
    pathNodeIds.unshift(curr)
    curr = prev[curr]?.from
  }

  // Build coordinate LineString
  const coordinates = []
  coordinates.push([fromLon, fromLat])
  for (const id of pathNodeIds) {
    const node = CAMPUS_GRAPH_NODES[id]
    // Avoid duplicate point if very close
    const last = coordinates[coordinates.length - 1]
    if (!last || Math.abs(last[0] - node.lon) > 0.00002 || Math.abs(last[1] - node.lat) > 0.00002) {
      coordinates.push([node.lon, node.lat])
    }
  }
  coordinates.push([toLon, toLat])

  // Total distance
  let totalMeters = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalMeters += haversineDistanceMeters(
      coordinates[i][1],
      coordinates[i][0],
      coordinates[i + 1][1],
      coordinates[i + 1][0]
    )
  }
  totalMeters = Math.max(25, Math.round(totalMeters))
  const durationMin = Math.max(1, Math.round(totalMeters / 75)) // 75m/min walking speed

  // Multilingual step templates
  const TEMPLATES = {
    depart: {
      'zh-TW': (f, p) => `從 <b>${f}</b> 出發，沿 <b>${p}</b> 直行`,
      en: (f, p) => `Head out from <b>${f}</b>, continue along <b>${p}</b>`,
      ja: (f, p) => `<b>${f}</b> を出発し、<b>${p}</b> に沿って直進`,
      ko: (f, p) => `<b>${f}</b> 에서 출발하여 <b>${p}</b>(을)를 따라 직진`,
      vi: (f, p) => `Xuất phát từ <b>${f}</b>, đi thẳng theo <b>${p}</b>`,
      id: (f, p) => `Berangkat dari <b>${f}</b>, lurus di <b>${p}</b>`,
      th: (f, p) => `ออกจาก <b>${f}</b> ตรงไปตาม <b>${p}</b>`,
    },
    pass: {
      'zh-TW': (m) => `途經 <b>${m}</b>，繼續沿校園步道前行`,
      en: (m) => `Pass <b>${m}</b>, continue along the campus walkway`,
      ja: (m) => `<b>${m}</b> を通過し、キャンパス歩道を進む`,
      ko: (m) => `<b>${m}</b>(을)를 지나 캠퍼스 보도를 따라 이동`,
      vi: (m) => `Đi qua <b>${m}</b>, tiếp tục đi theo lối đi`,
      id: (m) => `Melewati <b>${m}</b>, lanjutkan menyusuri jalur pejalan kaki`,
      th: (m) => `ผ่าน <b>${m}</b> เดินต่อไปตามทางเดินเท้า`,
    },
    arrive: {
      'zh-TW': (t) => `抵達目的地 <b>${t}</b>`,
      en: (t) => `Arrive at destination <b>${t}</b>`,
      ja: (t) => `目的地 <b>${t}</b> に到着`,
      ko: (t) => `목적지 <b>${t}</b> 도착`,
      vi: (t) => `Đến điểm đến <b>${t}</b>`,
      id: (t) => `Tiba di tujuan <b>${t}</b>`,
      th: (t) => `ถึงจุดหมายปลายทาง <b>${t}</b>`,
    },
  }

  const loc = locale || 'zh-TW'
  const tDepart = TEMPLATES.depart[loc] || TEMPLATES.depart.en
  const tPass = TEMPLATES.pass[loc] || TEMPLATES.pass.en
  const tArrive = TEMPLATES.arrive[loc] || TEMPLATES.arrive.en

  const fromName = (loc === 'en' && from.nameEn) || (loc === 'ja' && from.nameJa) || from.nameZh || '出發點'
  const toName = (loc === 'en' && to.nameEn) || (loc === 'ja' && to.nameJa) || to.nameZh || '目的地'
  const fromNameZh = from.nameZh || '出發點'
  const toNameZh = to.nameZh || '目的地'

  const steps = []

  if (pathNodeIds.length <= 1) {
    steps.push({
      index: 1,
      instruction: tDepart(fromName, translateStreet('校園人行步道', loc)),
      instructionZh: TEMPLATES.depart['zh-TW'](fromNameZh, '校園人行步道'),
      distance: `${totalMeters} m`,
      duration: `${durationMin} min`,
    })
  } else {
    // Step 1: Depart
    const firstEdge = prev[pathNodeIds[1]]
    const firstWalkway = translateStreet(firstEdge?.name || '榕樹大道', loc)
    const firstWalkwayZh = firstEdge?.name || '榕樹大道'
    steps.push({
      index: 1,
      instruction: tDepart(fromName, firstWalkway),
      instructionZh: TEMPLATES.depart['zh-TW'](fromNameZh, firstWalkwayZh),
      distance: `${Math.round(totalMeters * 0.4)} m`,
      duration: `${Math.max(1, Math.round(durationMin * 0.4))} min`,
    })

    // Step 2: Intermediate waypoint
    if (pathNodeIds.length >= 3) {
      const midNode = CAMPUS_GRAPH_NODES[pathNodeIds[Math.floor(pathNodeIds.length / 2)]]
      const midName = (loc === 'en' && midNode.nameEn) || (loc === 'ja' && midNode.nameJa) || midNode.nameZh
      steps.push({
        index: 2,
        instruction: tPass(midName),
        instructionZh: TEMPLATES.pass['zh-TW'](midNode.nameZh),
        distance: `${Math.round(totalMeters * 0.4)} m`,
        duration: `${Math.max(1, Math.round(durationMin * 0.4))} min`,
      })
    }

    // Step 3: Arrive
    steps.push({
      index: steps.length + 1,
      instruction: tArrive(toName),
      instructionZh: TEMPLATES.arrive['zh-TW'](toNameZh),
      distance: `${Math.round(totalMeters * 0.2)} m`,
      duration: '1 min',
    })
  }

  return {
    geometry: {
      type: 'LineString',
      coordinates,
    },
    distanceMeters: totalMeters,
    durationSeconds: durationMin * 60,
    durationMinutes: durationMin,
    steps,
  }
}

export async function fetchRoute(from, to, profile = 'foot', locale = 'zh-TW') {
  const fromLon = from?.lon ?? from?.lng
  const fromLat = from?.lat
  const toLon = to?.lon ?? to?.lng
  const toLat = to?.lat

  if (fromLon == null || fromLat == null || toLon == null || toLat == null) {
    throw new Error('未指定正確的起點或終點座標')
  }

  const isBothInsideCampus = isInsideCampus(fromLat, fromLon) && isInsideCampus(toLat, toLon)

  // 1. CAMPUS WALKING: When walking within FCU campus, use our surveyed Campus Walkway Network
  // as the primary ground truth. (Avoids unverified OSM detours, dead-ends, and impassable areas like the Lotus Pond)
  if (profile === 'foot' && isBothInsideCampus) {
    try {
      const campusRoute = solveCampusWalkwayRoute(from, to, locale)
      if (campusRoute && campusRoute.geometry?.coordinates?.length >= 2) {
        return campusRoute
      }
    } catch (e) {
      console.warn('Campus walkway routing error, fallback to OSRM:', e)
    }
  }

  // 2. DRIVING / OFF-CAMPUS: Use OSRM for driving and external road routing
  let data = null
  const endpoints = ROUTING_ENDPOINTS[profile] || ROUTING_ENDPOINTS.foot

  for (const base of endpoints) {
    try {
      const url = `${base}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const json = await res.json()
        if (json.code === 'Ok' && json.routes?.length) {
          data = json
          break
        }
      }
    } catch {
      // try next fallback
    }
  }

  if (!data || !data.routes?.length) {
    if (isBothInsideCampus && profile === 'foot') {
      return solveCampusWalkwayRoute(from, to, locale)
    }
    throw new Error('找不到合適的導航路線')
  }

  const route = data.routes[0]
  const leg = route.legs[0]
  const distMeters = Math.round(route.distance)
  const calcMinutes = profile === 'foot'
    ? Math.max(1, Math.round(distMeters / 75)) // 75m/min = 4.5km/h walking speed
    : Math.max(1, Math.round(route.duration / 60))

  return {
    geometry: route.geometry, // GeoJSON LineString
    distanceMeters: distMeters,
    durationSeconds: Math.round(route.duration),
    durationMinutes: calcMinutes,
    steps: (leg.steps || []).map((s, i) => ({
      index: i + 1,
      instruction: formatManeuver(s.maneuver || {}, s.name, locale),
      instructionZh: locale !== 'zh-TW' ? formatManeuver(s.maneuver || {}, s.name, 'zh-TW') : null,
      distance: formatDist(s.distance, locale),
      duration: formatTime(s.duration, locale),
    })),
  }
}

function formatManeuver(maneuver, streetName, locale = 'zh-TW') {
  const type = maneuver.type || ''
  const modifier = maneuver.modifier || ''
  const localizedStreet = translateStreet(streetName, locale)
  const loc = locale || 'zh-TW'

  // Determine action key
  let actionKey = type
  if (type === 'turn' || type === 'end of road') {
    if (modifier === 'left') actionKey = 'turn_left'
    else if (modifier === 'right') actionKey = 'turn_right'
    else if (modifier === 'slight left') actionKey = 'turn_slight_left'
    else if (modifier === 'slight right') actionKey = 'turn_slight_right'
    else if (modifier === 'sharp left') actionKey = 'turn_sharp_left'
    else if (modifier === 'sharp right') actionKey = 'turn_sharp_right'
    else if (modifier === 'uturn') actionKey = 'turn_uturn'
    else actionKey = 'continue'
  } else if (type === 'fork') {
    actionKey = modifier === 'left' ? 'fork_left' : 'fork_right'
  } else if (type === 'new name' || type === 'continue') {
    actionKey = 'continue'
  }

  // Multilingual translations table with contextual campus descriptions
  const MANEUVERS = {
    depart: {
      'zh-TW': '從出發點出發，沿校園人行步道前行',
      en: 'Head out from origin along the campus walkway',
      ja: '出発点より、キャンパス歩道を進む',
      ko: '출발지에서 캠퍼스 보도를 따라 직진',
      vi: 'Xuất phát, đi theo lối đi bộ trong khuôn viên',
      id: 'Berangkat dari titik awal, ikuti jalur pejalan kaki kampus',
      th: 'ออกเดินทางจากจุดเริ่มต้น เดินตามทางเดินเท้าในมหาวิทยาลัย',
    },
    arrive: {
      'zh-TW': '抵達目的地大樓',
      en: 'Arrive at destination building',
      ja: '目的地の大楼に到着',
      ko: '목적지 건물 도착',
      vi: 'Đến tòa nhà điểm đến',
      id: 'Tiba di gedung tujuan',
      th: 'ถึงอาคารจุดหมายปลายทาง',
    },
    turn_left: {
      'zh-TW': localizedStreet ? `左轉，沿 <b>${localizedStreet}</b> 前進` : '左轉，沿校園步道前進',
      en: localizedStreet ? `Turn left onto <b>${localizedStreet}</b>` : 'Turn left along the campus pathway',
      ja: localizedStreet ? `左折して <b>${localizedStreet}</b> へ進む` : '左折して校内通路を進む',
      ko: localizedStreet ? `좌회전하여 <b>${localizedStreet}</b> 진행` : '좌회전하여 캠퍼스 통로 진행',
      vi: localizedStreet ? `Rẽ trái vào <b>${localizedStreet}</b>` : 'Rẽ trái theo đường nội khu',
      id: localizedStreet ? `Belok kiri ke <b>${localizedStreet}</b>` : 'Belok kiri menyusuri jalan kampus',
      th: localizedStreet ? `เลี้ยวซ้ายเข้าสู่ <b>${localizedStreet}</b>` : 'เลี้ยวซ้ายตามทางเดินในมหาวิทยาลัย',
    },
    turn_right: {
      'zh-TW': localizedStreet ? `右轉，沿 <b>${localizedStreet}</b> 前進` : '右轉，沿校園步道前進',
      en: localizedStreet ? `Turn right onto <b>${localizedStreet}</b>` : 'Turn right along the campus pathway',
      ja: localizedStreet ? `右折して <b>${localizedStreet}</b> へ進む` : '右折して校内通路を進む',
      ko: localizedStreet ? `우회전하여 <b>${localizedStreet}</b> 진행` : '우회전하여 캠퍼스 통로 진행',
      vi: localizedStreet ? `Rẽ phải vào <b>${localizedStreet}</b>` : 'Rẽ phải theo đường nội khu',
      id: localizedStreet ? `Belok kanan ke <b>${localizedStreet}</b>` : 'Belok kanan menyusuri jalan kampus',
      th: localizedStreet ? `เลี้ยวขวาเข้าสู่ <b>${localizedStreet}</b>` : 'เลี้ยวขวาตามทางเดินในมหาวิทยาลัย',
    },
    turn_slight_left: {
      'zh-TW': localizedStreet ? `稍微靠左，進入 <b>${localizedStreet}</b>` : '稍微靠左，沿步道直行',
      en: localizedStreet ? `Slight left onto <b>${localizedStreet}</b>` : 'Slight left, continue along pathway',
      ja: localizedStreet ? `斜め左方向、<b>${localizedStreet}</b> へ進む` : '斜め左方向、歩道を進む',
      ko: localizedStreet ? `약간 왼쪽 방향, <b>${localizedStreet}</b> 진행` : '약간 왼쪽 방향, 보도 따라 직진',
      vi: localizedStreet ? `Chếch sang trái vào <b>${localizedStreet}</b>` : 'Chếch sang trái, tiếp tục đi theo lối đi',
      id: localizedStreet ? `Agak ke kiri ke <b>${localizedStreet}</b>` : 'Agak ke kiri, lanjut di jalur pejalan kaki',
      th: localizedStreet ? `ชิดซ้ายเล็กน้อยเข้าสู่ <b>${localizedStreet}</b>` : 'ชิดซ้ายเล็กน้อย ตรงไปตามทางเดิน',
    },
    turn_slight_right: {
      'zh-TW': localizedStreet ? `稍微靠右，進入 <b>${localizedStreet}</b>` : '稍微靠右，沿步道直行',
      en: localizedStreet ? `Slight right onto <b>${localizedStreet}</b>` : 'Slight right, continue along pathway',
      ja: localizedStreet ? `斜め右方向、<b>${localizedStreet}</b> へ進む` : '斜め右方向、歩道を進む',
      ko: localizedStreet ? `약간 오른쪽 방향, <b>${localizedStreet}</b> 진행` : '약간 오른쪽 방향, 보도 따라 직진',
      vi: localizedStreet ? `Chếch sang phải vào <b>${localizedStreet}</b>` : 'Chếch sang phải, tiếp tục đi theo lối đi',
      id: localizedStreet ? `Agak ke kanan ke <b>${localizedStreet}</b>` : 'Agak ke kanan, lanjut di jalur pejalan kaki',
      th: localizedStreet ? `ชิดขวาเล็กน้อยเข้าสู่ <b>${localizedStreet}</b>` : 'ชิดขวาเล็กน้อย ตรงไปตามทางเดิน',
    },
    turn_sharp_left: {
      'zh-TW': localizedStreet ? `急左轉，進入 <b>${localizedStreet}</b>` : '急左轉，沿步道前進',
      en: localizedStreet ? `Sharp left onto <b>${localizedStreet}</b>` : 'Sharp left, follow pathway',
      ja: localizedStreet ? `大きく左折して <b>${localizedStreet}</b> へ進む` : '大きく左折して歩道を進む',
      ko: localizedStreet ? `급좌회전하여 <b>${localizedStreet}</b> 진행` : '급좌회전하여 보도 진행',
      vi: localizedStreet ? `Rẽ gắt sang trái vào <b>${localizedStreet}</b>` : 'Rẽ gắt sang trái theo lối đi',
      id: localizedStreet ? `Belok tajam ke kiri ke <b>${localizedStreet}</b>` : 'Belok tajam ke kiri di jalur',
      th: localizedStreet ? `เลี้ยวซ้ายหักศอกเข้าสู่ <b>${localizedStreet}</b>` : 'เลี้ยวซ้ายหักศอกตามทางเดิน',
    },
    turn_sharp_right: {
      'zh-TW': localizedStreet ? `急右轉，進入 <b>${localizedStreet}</b>` : '急右轉，沿步道前進',
      en: localizedStreet ? `Sharp right onto <b>${localizedStreet}</b>` : 'Sharp right, follow pathway',
      ja: localizedStreet ? `大きく右折して <b>${localizedStreet}</b> へ進む` : '大きく右折して歩道を進む',
      ko: localizedStreet ? `급우회전하여 <b>${localizedStreet}</b> 진행` : '급우회전하여 보도 진행',
      vi: localizedStreet ? `Rẽ gắt sang phải vào <b>${localizedStreet}</b>` : 'Rẽ gắt sang phải theo lối đi',
      id: localizedStreet ? `Belok tajam ke kanan ke <b>${localizedStreet}</b>` : 'Belok tajam ke kanan di jalur',
      th: localizedStreet ? `เลี้ยวขวาหักศอกเข้าสู่ <b>${localizedStreet}</b>` : 'เลี้ยวขวาหักศอกตามทางเดิน',
    },
    turn_uturn: {
      'zh-TW': '於步道迴轉後直行',
      en: 'Make a U-turn and continue',
      ja: 'Uターンして直進する',
      ko: '유턴하여 직진',
      vi: 'Quay đầu và tiếp tục đi thẳng',
      id: 'Putar balik dan lurus terus',
      th: 'กลับรถแล้วตรงต่อไป',
    },
    fork_left: {
      'zh-TW': '岔路靠左走，沿步道前進',
      en: 'Keep left at the fork along the pathway',
      ja: '分岐を左側へ進む',
      ko: '갈림길에서 왼쪽으로 진행',
      vi: 'Đi bên trái ở ngã ba theo lối đi',
      id: 'Ambil jalur kiri di percabangan',
      th: 'ชิดซ้ายที่ทางแยกตามทางเดิน',
    },
    fork_right: {
      'zh-TW': '岔路靠右走，沿步道前進',
      en: 'Keep right at the fork along the pathway',
      ja: '分岐を右側へ進む',
      ko: '갈림길에서 오른쪽으로 진행',
      vi: 'Đi bên phải ở ngã ba theo lối đi',
      id: 'Ambil jalur kanan di percabangan',
      th: 'ชิดขวาที่ทางแยกตามทางเดิน',
    },
    continue: {
      'zh-TW': localizedStreet ? `繼續直走，沿 <b>${localizedStreet}</b> 前進` : '繼續直走，沿校園林蔭步道前行',
      en: localizedStreet ? `Continue straight along <b>${localizedStreet}</b>` : 'Continue straight along the campus walkway',
      ja: localizedStreet ? `直進して <b>${localizedStreet}</b> を進む` : '直進してキャンパス遊歩道を進む',
      ko: localizedStreet ? `직진하여 <b>${localizedStreet}</b> 진행` : '캠퍼스 보도를 따라 직진',
      vi: localizedStreet ? `Tiếp tục đi thẳng theo <b>${localizedStreet}</b>` : 'Tiếp tục đi thẳng theo lối đi bộ khuôn viên',
      id: localizedStreet ? `Lurus terus di <b>${localizedStreet}</b>` : 'Lurus terus menyusuri jalur pejalan kaki kampus',
      th: localizedStreet ? `ตรงต่อไปตาม <b>${localizedStreet}</b>` : 'ตรงต่อไปตามทางเดินเท้าในมหาวิทยาลัย',
    },
  }

  const table = MANEUVERS[actionKey] || MANEUVERS['continue']
  return table[loc] || table['en'] || table['zh-TW']
}

function formatDist(meters, locale = 'zh-TW') {
  if (meters < 1000) {
    const unit = locale === 'zh-TW' ? '公尺' : locale === 'ja' ? 'm' : locale === 'ko' ? 'm' : 'm'
    return `${Math.round(meters)} ${unit}`
  }
  const unit = locale === 'zh-TW' ? '公里' : 'km'
  return `${(meters / 1000).toFixed(1)} ${unit}`
}

function formatTime(seconds, locale = 'zh-TW') {
  if (seconds < 60) {
    if (locale === 'zh-TW') return `${Math.round(seconds)} 秒`
    if (locale === 'ja') return `${Math.round(seconds)} 秒`
    if (locale === 'ko') return `${Math.round(seconds)} 초`
    if (locale === 'vi') return `${Math.round(seconds)} giây`
    if (locale === 'id') return `${Math.round(seconds)} dtk`
    if (locale === 'th') return `${Math.round(seconds)} วินาที`
    return `${Math.round(seconds)} sec`
  }
  const min = Math.round(seconds / 60)
  if (locale === 'zh-TW') return `約 ${min} 分鐘`
  if (locale === 'ja') return `約 ${min} 分`
  if (locale === 'ko') return `약 ${min} 분`
  if (locale === 'vi') return `khoảng ${min} phút`
  if (locale === 'id') return `sekitar ${min} mnt`
  if (locale === 'th') return `ประมาณ ${min} นาที`
  return `~${min} min`
}
