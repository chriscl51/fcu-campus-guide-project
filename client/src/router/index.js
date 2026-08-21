import { createRouter, createWebHashHistory } from 'vue-router'
import GuideView from '../views/GuideView.vue'
import AdminView from '../views/AdminView.vue'

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
