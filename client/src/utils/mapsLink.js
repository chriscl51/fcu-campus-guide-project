// Google Maps deep link — plain URL, no API key / no billing, per the
// project's "no paid APIs" constraint. Opens the Google Maps app on mobile
// or maps.google.com on desktop, defaulted to walking/driving directions.
export function googleMapsDirectionsUrl(lat, lon, { travelmode = 'driving' } = {}) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${lat},${lon}`,
    travelmode,
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

// Feedback item: the parking screen should show Google Maps side-by-side
// with the in-app lot picker, not just a link-out button. This is the
// classic key-free Google Maps embed ("output=embed" query trick) — it
// works without any API key or billing setup, but it's an undocumented URL
// pattern rather than the official (paid, key-required) Maps Embed API, so
// Google could change or drop it without notice. If that ever happens, the
// "open in Google Maps" button (googleMapsDirectionsUrl above) still works
// as a full fallback. See README's known-limitations section.
export function googleMapsEmbedUrl(lat, lon, { zoom = 17 } = {}) {
  const params = new URLSearchParams({ q: `${lat},${lon}`, z: String(zoom), output: 'embed' })
  return `https://www.google.com/maps?${params.toString()}`
}
