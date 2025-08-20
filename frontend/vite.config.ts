import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The `css` block has been removed. 
  // Vite will automatically detect and use the `postcss.config.js` file.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})