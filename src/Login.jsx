import { useState } from 'react'
import { supabase } from './supabase'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setError(error.message)
      else if (data.user && !data.session) setInfo('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setLoading(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!email) { setError('Enter your email first, then click "Forgot password?".'); return }
    setLoading(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setError(error.message)
    else setInfo('Password reset email sent. Check your inbox.')
    setLoading(false)
  }

  function switchMode() {
    setMode(m => m === 'signin' ? 'signup' : 'signin')
    setError('')
    setInfo('')
  }

  const submitLabel = mode === 'signin' ? 'Sign In' : 'Create Account'
  const submitLoading = mode === 'signin' ? 'Signing in…' : 'Creating account…'

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-header">
          <span className="logo-mark">◆</span>
          <h1>Ridge Planner</h1>
        </div>
        <p className="login-sub">{mode === 'signin' ? 'Sign in to continue' : 'Create an account'}</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus
            autoComplete="email"
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
          {error && <p className="login-error">{error}</p>}
          {info && <p className="login-info">{info}</p>}
          <button
            className="confirm-btn login-btn"
            type="submit"
            disabled={loading || !email || !password}
          >
            {loading ? submitLoading : submitLabel}
          </button>
        </form>

        {mode === 'signin' && (
          <button type="button" className="login-link" onClick={handleReset} disabled={loading}>
            Forgot password?
          </button>
        )}

        <div className="login-divider"><span>or</span></div>

        <button
          type="button"
          className="login-google"
          onClick={handleGoogle}
          disabled={loading}
        >
          Sign in with Google
        </button>

        <p className="login-switch">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button type="button" className="login-link" onClick={switchMode} disabled={loading}>
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
