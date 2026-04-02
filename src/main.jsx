import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'

function Root() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('studio_token'))
  return authed ? <App onLogout={() => { localStorage.removeItem('studio_token'); setAuthed(false) }} /> : <Login onLogin={() => setAuthed(true)} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Root /></StrictMode>
)
