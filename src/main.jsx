import { StrictMode, useState, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'
import { AUTH_TOKEN_KEY } from './constants'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0e0e1a', color: '#e8e8f0', fontFamily: "'DM Mono', monospace" }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: '#7070a0', fontSize: 13, marginBottom: 20 }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
              style={{ background: '#f4845f', border: 'none', color: '#fff', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 6, cursor: 'pointer' }}
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Root() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(AUTH_TOKEN_KEY))
  // DEV: login bypass — set to false to restore gate
  const BYPASS_LOGIN = true
  if (BYPASS_LOGIN) {
    return <App onLogout={() => { localStorage.removeItem(AUTH_TOKEN_KEY); setAuthed(false) }} />
  }
  return authed
    ? <App onLogout={() => { localStorage.removeItem(AUTH_TOKEN_KEY); setAuthed(false) }} />
    : <Login onLogin={() => setAuthed(true)} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>
)
