// Google Maps deep link — plain URL, no API key / no billing, per the
// project's constraint. Opens the Google Maps app on mobile or
// maps.google.com on desktop, defaulted to walking/driving directions.
export function googleMapsDirectionsUrl(lat, lon, { travelmode = 'driving' } = {}) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${lat},${lon}`,
    travelmode,
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
