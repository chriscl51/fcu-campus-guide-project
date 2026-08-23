// Georeferencing for the official illustrated campus map artwork
// (public/map/fcu-campus-map.webp, extracted from the school's
// Feng_Chia_University_Campus_Map_A3.pdf).
//
// WHY THIS EXISTS
// ---------------
// The routing graph (data/graph.json) is real surveyed OSM data in lat/lon.
// The map the user actually looks at is a hand-drawn illustration. To walk the
// deer along a real computed route on top of that illustration, we need a
// transform from lat/lon into the artwork's pixel space. That's what this file
// is: the artwork is treated as a georeferenced raster, exactly like you'd
// georeference a scanned paper map in GIS software.
//
// TWO THINGS TO KNOW ABOUT THE ARTWORK
// ------------------------------------
// 1. The artwork is georeferenced to the surveyed campus coordinates. Its
//    compass rose at bottom-left points right toward geographic north and the
//    North Gate, so the affine below follows the map's actual orientation.
// 2. IT IS AN ILLUSTRATION, NOT A SURVEY. Buildings are idealised into neat
//    rows and stretched to fill the frame (the fit is ~12% anisotropic). So a
//    single affine cannot place every building perfectly — see the anchoring
//    section below for how that residual is handled.
//
// HOW THE TRANSFORM WAS DERIVED (scripts are not shipped; this is the record)
// --------------------------------------------------------------------------
// 28 control points were measured directly off the artwork:
//   * 24 buildings — the centre of each numbered blue badge, found by colour-
//     segmenting the badge circles in the source raster (they are a distinct
//     navy, and a circle's area/bbox ratio ~0.785 cleanly separates them from
//     the square "P" parking icons).
//   * 4 campus gates — the small navy gate markers.
// Each was paired with that feature's real lat/lon from buildings.json /
// gates.json, then a least-squares affine was fitted in local metre space.
// Residual: mean ~16.6 m, max ~46 m.
//
// A thin-plate-spline warp was also tried (it interpolates the control points
// exactly). It was REJECTED: leave-one-out cross-validation was clearly worse
// than the plain affine (~25.7 m vs ~16.6 m mean). That tells us the scatter is
// mostly *noise* — a badge sits wherever it fits on its building, not at the
// building's centroid — rather than a smooth distortion worth modelling. TPS
// was fitting the noise. So: affine for the global mapping, plus explicit
// endpoint anchoring (below) for the part that actually has to be exact.
import geo from '../data/mapGeo.json'

export const MAP_IMAGE = geo.image

const { mLat, mLon, E0, N0 } = geo.meters
const AX = geo.affine.x
const AY = geo.affine.y

/** Pixels per real-world metre on the artwork (used to size things sanely). */
export const PX_PER_METER = geo.pxPerMeter

/**
 * Project real lat/lon into the campus-map artwork's pixel space.
 * Output is in the same coordinate system as the SVG viewBox
 * (0,0 = top-left of the image; MAP_IMAGE.width x MAP_IMAGE.height).
 */
export function projectMap(lat, lon) {
  const e = (lon - E0) * mLon
  const n = (lat - N0) * mLat
  return {
    x: AX[0] * e + AX[1] * n + AX[2],
    y: AY[0] * e + AY[1] * n + AY[2],
  }
}

/**
 * Where the artwork actually draws a given building/gate, by id — i.e. the
 * measured control point rather than the affine's estimate of it. Returns null
 * for anything not labelled on the artwork (e.g. a parking lot used as a drive-
 * mode origin), in which case callers should fall back to projectMap().
 */
export function anchorFor(id) {
  const a = id && geo.anchors[id]
  return a ? { x: a[0], y: a[1] } : null
}

/**
 * Convert a computed route (array of {lat, lon}) into artwork pixel points for
 * the deer to walk along.
 *
 * ENDPOINT ANCHORING — this is the important part. The affine is good in the
 * middle (routes visibly follow the drawn roads) but can land an endpoint up to
 * ~46 m from where the artwork actually draws that building, which reads as
 * plainly broken when the deer stops in the wrong place. We know exactly where
 * the artwork draws the origin and destination (they're control points), so we
 * pin both ends to their measured positions and blend the correction linearly
 * along the route by arc length:
 *
 *     warped(i) = affine(i) + (1 - t_i) * originError + t_i * destError
 *
 * This guarantees the deer starts on the right building and arrives on the
 * right building, while leaving the middle of the path essentially where the
 * affine put it. If either end has no anchor, that end's correction is simply
 * zero and the affine result stands.
 */
export function warpRoute(points, originId, destinationId) {
  const base = points.map((p) => projectMap(p.lat, p.lon))
  if (base.length === 0) return base

  const startAnchor = anchorFor(originId)
  const endAnchor = anchorFor(destinationId)
  if (!startAnchor && !endAnchor) return base

  const dA = startAnchor
    ? { x: startAnchor.x - base[0].x, y: startAnchor.y - base[0].y }
    : { x: 0, y: 0 }
  const last = base[base.length - 1]
  const dB = endAnchor ? { x: endAnchor.x - last.x, y: endAnchor.y - last.y } : { x: 0, y: 0 }

  // normalised arc length along the affine-projected route
  const cum = [0]
  for (let i = 1; i < base.length; i++) {
    const dx = base[i].x - base[i - 1].x
    const dy = base[i].y - base[i - 1].y
    cum.push(cum[i - 1] + Math.hypot(dx, dy))
  }
  const total = cum[cum.length - 1] || 1

  return base.map((p, i) => {
    const t = cum[i] / total
    return {
      x: p.x + (1 - t) * dA.x + t * dB.x,
      y: p.y + (1 - t) * dA.y + t * dB.y,
    }
  })
}
