import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// Test hook for scripted walkthrough checks in development only.
if (import.meta.env.DEV) {
  import('./store/app').then((m) => {
    ;(window as unknown as { __nicc: unknown }).__nicc = m.useApp
  })
}
