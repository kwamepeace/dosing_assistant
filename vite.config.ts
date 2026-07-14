/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Stack deliberately mirrors PMS_2.0 (React 19 + Tailwind v4 + Vite) so the
// engine + UI port into the Electron app later with minimal rework.
//
// `plugins` is cast because vitest 2.x bundles its own Vite 5 while the app runs
// Vite 6 — two structurally-identical-but-nominally-different Plugin types. The
// proper fix is a single Vite (align vitest to v6); until then this bridges the
// type-only mismatch and changes nothing at runtime.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Offline-first: precache the built app so it opens on an unreliable ward
    // connection. Dosing runs entirely client-side, so a cached shell is fully
    // functional offline (Supabase auth, when configured, still needs network).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      devOptions: { enabled: false },
      manifest: {
        name: 'Paediatric Dosing & Dispensing',
        short_name: 'Paeds Dosing',
        description: 'Weight/age-based paediatric dose and dispensing calculator (Ghana).',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ] as never,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
