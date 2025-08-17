import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import tailwindcss from 'tailwindcss' // Added
import autoprefixer from 'autoprefixer' // Added

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: { // Added CSS PostCSS configuration for Tailwind
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})