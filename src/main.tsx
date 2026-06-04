import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'
import { initializeLLMFromEnv } from './services/llmService'

// Initialize LLM service
const llmInitialized = initializeLLMFromEnv()
if (import.meta.env.DEV) {
  if (llmInitialized) {
    console.log('[Main] Browser LLM initialized')
  } else {
    console.warn('[Main] Browser LLM not configured (core planning uses the backend)')
  }
}

createRoot(document.getElementById('root')!).render(<App />)
