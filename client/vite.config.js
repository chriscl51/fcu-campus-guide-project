import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // GitHub Pages serves this app from a project subpath
  // (https://<user>.github.io/fcu-campus-guide-project/), not the domain
  // root — local dev serves from root, so this subpath base
  // only kicks in when the GitHub Pages workflow sets GITHUB_PAGES=true.
  base: process.env.GITHUB_PAGES ? '/fcu-campus-guide-project/' : '/',
})
