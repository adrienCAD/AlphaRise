import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig(({ mode }) => {
  // Load env vars from parent directory first (lower priority)
  const parentEnv = loadEnv(mode, resolve(__dirname, '..'), '')
  
  // Load env vars from current directory (higher priority, will override parent)
  const currentEnv = loadEnv(mode, __dirname, '')
  
  // Merge: parent env first, then current env (current overrides parent)
  // This ensures VITE_ prefixed vars from both locations are available
  const mergedEnv = { ...parentEnv, ...currentEnv }
  
  // Make merged env vars available to Vite's process.env
  Object.keys(mergedEnv).forEach(key => {
    if (key.startsWith('VITE_')) {
      process.env[key] = mergedEnv[key]
    }
  })
  
  return {
    plugins: [react()],
  }
})


