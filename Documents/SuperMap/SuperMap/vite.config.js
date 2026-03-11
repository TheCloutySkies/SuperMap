import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
// Use SWC instead of Babel to avoid "getSource is not a function" in react-refresh
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev, /api/* goes to the backend so feeds work without CORS or wrong port
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
