// frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: {
          enabled: true,
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
        },
        manifest: {
          name: 'PediaQuiz',
          short_name: 'PediaQuiz',
          description: 'A pediatric medical education and quizzing application for students and residents.',
          theme_color: '#0ea5e9',
          background_color: '#f8fafc',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pediaquiz-logo.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              // --- FINAL RUNTIME FIX: MANIFEST SYNTAX ---
              // The `purpose` property must be a space-separated string, not an array.
              // This change corrects the manifest syntax and removes the console error.
              purpose: 'any maskable'
            },
            {
              src: 'pediaquiz-logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) {
                return 'firebase-vendor';
              } else if (id.includes('react')) {
                return 'react-vendor';
              }
              return 'vendor';
            }
          },
        },
      },
    },
    define: {
      'self.__FIREBASE_CONFIG__': JSON.stringify(firebaseConfig),
    },
  };
});