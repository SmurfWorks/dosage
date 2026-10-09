import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Dosage Helper',
        short_name: 'Dosage Helper',
        description:
          'Personal calculator for carbohydrate and insulin doses from your glucose reading.',
        // Left out on purpose: Chrome on Android (156 and later) paints an installed app's navigation bar with the
        // manifest colour, which has no dark variant, so the bar stayed cream in dark mode. Without it the bar
        // follows the phone's theme, and the theme-color meta tags in index.html still colour the status bar.
        // The plugin fills in its own default unless this is explicitly undefined.
        theme_color: undefined,
        background_color: '#efe8dc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        lang: 'en',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
