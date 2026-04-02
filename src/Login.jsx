import { useState } from 'react'

const LOGIN_URL = 'https://jsqfdwapzwfhoxkosncv.supabase.co/functions/v1/login'

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
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('studio_token', data.token)
        onLogin()
      } else {
        setError('Invalid username or password')
      }
    } catch (err) {
      setError('Something went wrong, try again')
    }
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-header">
          <span className="logo-mark">◆</span>
          <h1>Studio Log</h1>
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
