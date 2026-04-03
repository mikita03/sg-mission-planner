import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: set base to repo name
// e.g. base: '/sg-mission-planner/'
// For custom domain or Notion embed, use '/'
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/sg-mission-planner/' : '/',
  plugins: [react()],
})
