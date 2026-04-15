import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-app.svg'],
      manifest: {
        name: 'Casa Clara Financeiro',
        short_name: 'Casa Clara',
        description: 'Controle compartilhado de gastos familiares com visao mensal e historico.',
        theme_color: '#355c7d',
        background_color: '#fffaf5',
        display: 'standalone',
        start_url: '/',
        icons: [
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