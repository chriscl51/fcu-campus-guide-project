import { createRouter, createWebHashHistory } from 'vue-router'
import GuideView from '../views/GuideView.vue'
import AdminView from '../views/AdminView.vue'

// Hash history means the real admin URL is "/#/admin" — a visitor who types
// or bookmarks a plain "/admin" (no hash) never reaches vue-router with that
// path at all, since hash routers only ever look at the fragment; they just
// silently land back on "/" (the landing page), which is exactly the
// confusing "admin login is missing" symptom this fixes. One-time redirect
// on boot, before the router exists, so a bare "/admin" URL still resolves
// to the admin login screen. Doesn't touch file://-opened builds (those have
// no meaningful pathname to match) or normal in-app navigation (the
// "Admin Panel" link already goes to "/#/admin" directly).
if (typeof window !== 'undefined' && !window.location.hash && /\/admin\/?$/.test(window.location.pathname)) {
  window.location.replace(window.location.pathname.replace(/\/admin\/?$/, '/#/admin'))
}

// Hash history so the built dist/ can be opened straight from disk (file://)
// or from any static host without server-side rewrite rules — matters since
// this ships as a zip meant to be run locally / deployed anywhere.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'guide', component: GuideView },
    { path: '/admin', name: 'admin', component: AdminView },
  ],
})

export default router
