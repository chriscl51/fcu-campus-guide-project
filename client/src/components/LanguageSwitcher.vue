<script setup>
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, LOCALE_LABELS, persistLocale } from '../i18n/index.js'

const { locale } = useI18n({ useScope: 'global' })

function onChange(e) {
  locale.value = e.target.value
  persistLocale(e.target.value)
}
</script>

<template>
  <label class="lang-switcher">
    <span class="sr-only">{{ $t('language.label') }}</span>
    <select :value="locale" @change="onChange" aria-label="Language">
      <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">
        {{ LOCALE_LABELS[code] }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.lang-switcher select {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  padding: 0.35em 0.6em;
  font-weight: 600;
}
.lang-switcher select option {
  color: #111;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
