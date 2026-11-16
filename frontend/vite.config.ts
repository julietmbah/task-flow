
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * TaskFlow Vite Configuration
 *
 * React frontend: http://localhost:3000
 * NestJS backend: http://localhost:8080
 */

export default defineConfig({
  // Enable React support.
  plugins: [react()],

  server: {
    // Run React on port 3000.
    port: 3000,

    // Do not automatically switch ports.
    strictPort: true,

    // Forward API requests to NestJS.
    proxy: {
      '/api': {
        // Address of the NestJS backend.
        target: 'http://localhost:8080',

        // Update the host header for the target.
        changeOrigin: true,

        // Remove /api before forwarding requests.
        // /api/auth/me becomes /auth/me.
        rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
      },
    },
  },
})
