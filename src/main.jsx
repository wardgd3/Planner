import { StrictMode, useState, useEffect, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './Login.jsx'
import { supabase } from './supabase'

document.documentElement.setAttribute('data-theme', localStorage.getItem('app-theme') || 'slate-arrow')

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
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) return null
  return session
    ? <App onLogout={() => supabase.auth.signOut()} />
    : <Login />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>
)
