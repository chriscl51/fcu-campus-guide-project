// Resolves a path into the public/ folder (e.g. "stickers/deer-go.png") to a
// URL that works both at the domain root (local dev, Azure Static Web Apps)
// and under a GitHub Pages project subpath (https://<user>.github.io/<repo>/)
// — see vite.config.js's `base`. A plain root-absolute string like
// "/stickers/deer-go.png" only resolves correctly at the root, so anything
// referencing public/ must go through this instead of a literal string.
export function publicUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
