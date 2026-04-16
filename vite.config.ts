import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-app.svg', 'icon-app-32.png', 'icon-app-180.png', 'icon-app-192.png', 'icon-app-512.png'],
      manifest: {
        name: 'Casa Clara Financeiro',
        short_name: 'Casa Clara',
        description: 'Controle compartilhado de gastos familiares com visao mensal e historico.',
        id: '/',
        theme_color: '#355c7d',
        background_color: '#fffaf5',
        orientation: 'portrait',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-app-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-app-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-app-180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-app.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    port: 5173,
  },
});