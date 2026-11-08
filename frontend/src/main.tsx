
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App'
import { AuthProvider } from './contexts/AuthProvider'

// IMPORTANT:
// Import the single global stylesheet.
// This contains styling for the login,
// dashboard, sidebar, and dark/light modes.
import './index.css'

/**
 * Initialize the TaskFlow React application.
 */
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
