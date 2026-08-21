<script setup>
import { onMounted } from 'vue'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import { useAnnouncementsStore } from './stores/announcements'

const announcements = useAnnouncementsStore()
onMounted(() => announcements.loadBaseline())
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <router-link to="/" class="brand">
        <span class="brand-deer">🦌</span>
        <span class="brand-name">{{ $t('common.appName') }}</span>
      </router-link>
      <div class="topbar-right">
        <router-link to="/admin" class="admin-link">{{ $t('admin.entryButton') }}</router-link>
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
  font-size: 1.05rem;
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
.brand-deer {
  font-size: 1.4rem;
  flex-shrink: 0;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
  white-space: nowrap;
}
.admin-link {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85rem;
  text-decoration: none;
  border-bottom: 1px dotted rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}
.admin-link:hover {
  color: #fff;
}

@media (max-width: 480px) {
  .app-topbar {
    justify-content: center;
  }
  .brand {
    flex: 1 1 100%;
    justify-content: center;
    text-align: center;
    font-size: 0.95rem;
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
