import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const extensions = [
  '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
  '.tsx', '.ts', '.jsx', '.js',
];

export default defineConfig({
  plugins: [
    react(),
    // RR-7 / PERF-002: service worker so the installed PWA boots offline (previously
    // a cold offline start white-screened — state lived in localStorage but no assets
    // were cached). Conservative setup: precache the app shell (incl. fonts and the
    // lazy question-bank chunk so quizzes work offline); autoUpdate activates new
    // versions on the next load. The hand-authored public/manifest.json is kept.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Never serve the SPA shell for real files that are missing (e.g. old hashed
        // chunks after a deploy) — let those 404 so autoUpdate recovers cleanly.
        navigateFallbackDenylist: [/\.[a-z0-9]+$/i],
      },
    }),
  ],
  resolve: {
    extensions,
    alias: {
      'react-native': 'react-native-web',
      'react-native/Libraries/Utilities/Platform': path.resolve(__dirname, 'node_modules/react-native-web/dist/exports/Platform/index.js'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/utils/asyncStorageWeb.ts'),
    },
  },
  define: {
    global: 'window',
    __DEV__: JSON.stringify(true),
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-native-web',
      'react-native-safe-area-context',
      '@react-navigation/native',
      '@react-navigation/native-stack',
      '@react-navigation/bottom-tabs',
      'zustand',
    ],
    esbuildOptions: {
      resolveExtensions: extensions,
      jsx: 'automatic',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-native-web'],
          navigation: [
            '@react-navigation/native',
            '@react-navigation/native-stack',
            '@react-navigation/bottom-tabs',
          ],
        },
      },
    },
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 8082,
    host: 'localhost',
  },
});
