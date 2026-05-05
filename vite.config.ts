import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub project site: https://<owner>.github.io/rtp-bridget-riley/
  base: '/rtp-bridget-riley/',
})
