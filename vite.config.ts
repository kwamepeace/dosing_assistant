/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Stack deliberately mirrors PMS_2.0 (React 19 + Tailwind v4 + Vite) so the
// engine + UI port into the Electron app later with minimal rework.
//
// `plugins` is cast because vitest 2.x bundles its own Vite 5 while the app runs
// Vite 6 — two structurally-identical-but-nominally-different Plugin types. The
// proper fix is a single Vite (align vitest to v6); until then this bridges the
// type-only mismatch and changes nothing at runtime.
export default defineConfig({
  plugins: [react(), tailwindcss()] as never,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
