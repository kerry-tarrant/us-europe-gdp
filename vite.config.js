import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/us-europe-gdp/',
  build: {
    outDir: 'docs',
  },
})
