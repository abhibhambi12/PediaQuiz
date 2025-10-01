    // frontend/vite.config.ts
    import { defineConfig, loadEnv } from 'vite';
    import react from '@vitejs/plugin-react';
    import { VitePWA } from 'vite-plugin-pwa';
    import path from 'path';
    
    export default defineConfig(({ mode }) => {
      // Load env file based on `mode` in the current working directory.
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
            // Use 'injectManifest' to use our custom service worker
            strategies: 'injectManifest',
            srcDir: 'public',
            filename: 'sw.js',
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            devOptions: {
              enabled: true, // Enable PWA features in dev mode
            },
            manifest: {
              name: 'PediaQuiz',
              short_name: 'PediaQuiz',
              description: 'A pediatric medical education and quizzing application.',
              theme_color: '#0ea5e9',
              background_color: '#f8fafc',
              display: 'standalone',
              scope: '/',
              start_url: '/',
              icons: [
                { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: '/pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
              ],
            },
          }),
        ],
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
          },
        },
        // Define global constants for build-time replacement
        define: {
          // This will replace `self.__FIREBASE_CONFIG__` in sw.js and firebase-messaging-sw.js
          'self.__FIREBASE_CONFIG__': JSON.stringify(firebaseConfig),
        },
      };
    });