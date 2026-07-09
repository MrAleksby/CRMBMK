import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base по умолчанию — подпапка GitHub Pages.
// Для Firebase Hosting сайт лежит в корне: VITE_BASE=/ npm run build
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE || '/CRMBMK/',
})
