import { useState } from 'react'
import { AUTH_TOKEN_KEY } from './constants'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token)
        onLogin()
      } else {
        setError(data.error || 'Invalid username or password')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-header">
          <span className="logo-mark">◆</span>
          <h1>Habit Tracking</h1>
        </div>
        <p className="login-sub">Sign in to continue</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <input className="input" type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" />
          <input className="input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <p className="login-error">{error}</p>}
          <button className="confirm-btn login-btn" type="submit" disabled={loading || !username || !password}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
