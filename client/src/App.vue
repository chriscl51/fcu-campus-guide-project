<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import { useAnnouncementsStore } from './stores/announcements'

const announcements = useAnnouncementsStore()
const router = useRouter()

// Keep the hidden admin entry available across the whole app, rather than
// only while the landing splash is mounted. On macOS this is Control+Option+A
// (not Command); on Windows it is Ctrl+Alt+A.
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || '/admin'

function handleAdminHotkey(event) {
  if (event.ctrlKey && !event.metaKey && !event.shiftKey && event.altKey && event.code === 'KeyA') {
    event.preventDefault()
    router.push(ADMIN_PATH)
  }
}

onMounted(() => announcements.load())
onMounted(() => window.addEventListener('keydown', handleAdminHotkey))
onUnmounted(() => window.removeEventListener('keydown', handleAdminHotkey))
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <router-link to="/" class="brand">
        <span class="brand-name">{{ $t('common.appName') }}</span>
      </router-link>
      <div class="topbar-right">
        <LanguageSwitcher />
      </div>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.6rem 1rem;
  background: var(--fcu-maroon);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 40;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  text-decoration: none;
  font-weight: 700;
  /* Same size as the landing page's "我是「文華鹿」" heading (IntroSplash.vue's
     --intro-heading-size) — kept in sync manually since that variable is
     scoped to IntroSplash's own <style>. */
  font-size: clamp(1.25rem, 4vw, 2.1rem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.brand-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
  white-space: nowrap;
}
@media (max-width: 480px) {
  .app-topbar {
    justify-content: center;
  }
  .brand {
    flex: 1 1 100%;
    justify-content: center;
    text-align: center;
  }
  .topbar-right {
    flex: 1 1 100%;
    justify-content: center;
  }
}
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
