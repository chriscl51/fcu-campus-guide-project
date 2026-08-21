import { createRouter, createWebHashHistory } from 'vue-router'
import GuideView from '../views/GuideView.vue'
import AdminView from '../views/AdminView.vue'

// The admin route's path is intentionally not hardcoded as "/admin" — there
// is no visible link to it anywhere in the UI (see App.vue), the only way in
// is IntroSplash.vue's hotkey listener, so the path itself is part of the
// "hidden" entry. Override via VITE_ADMIN_PATH (see client/.env.example);
// defaults to '/admin' for local dev. Same caveat as VITE_ADMIN_PASSWORD:
// Vite still bakes this into the built JS, so it's obscurity against casual
// browsing, not real access control against someone who inspects the bundle.
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || '/admin'

// Hash history means the real admin URL is "/#" + ADMIN_PATH — a visitor who
// types or bookmarks the bare pathname (no hash) never reaches vue-router
// with that path at all, since hash routers only ever look at the fragment;
// they just silently land back on "/" (the landing page), which is exactly
// the confusing "admin login is missing" symptom this fixes. One-time
// redirect on boot, before the router exists, so a bare ADMIN_PATH URL still
// resolves to the admin login screen. Doesn't touch file://-opened builds
// (those have no meaningful pathname to match) or normal in-app navigation.
if (typeof window !== 'undefined' && !window.location.hash) {
  const escapedAdminPath = ADMIN_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const bareAdminPath = new RegExp(`${escapedAdminPath}/?$`)
  if (bareAdminPath.test(window.location.pathname)) {
    window.location.replace(window.location.pathname.replace(bareAdminPath, `/#${ADMIN_PATH}`))
  }
}

// Hash history so the built dist/ can be opened straight from disk (file://)
// or from any static host without server-side rewrite rules — matters since
// this ships as a zip meant to be run locally / deployed anywhere.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'guide', component: GuideView },
    { path: ADMIN_PATH, name: 'admin', component: AdminView },
  ],
})

export default router
