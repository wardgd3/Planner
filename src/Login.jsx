import { useState } from 'react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const validUser = import.meta.env.VITE_GATE_USER
    const validPass = import.meta.env.VITE_GATE_PASSWORD

    setTimeout(() => {
      if (username === validUser && password === validPass) {
        localStorage.setItem('studio_token', btoa(`${username}:${Date.now()}`))
        onLogin()
      } else {
        setError('Invalid username or password')
      }
      setLoading(false)
    }, 400)
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
