import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigurationError } from './lib/supabase'

const authErrors = {
  login: 'We couldn’t sign you in. Check your email and password, then try again.',
  signup: 'We couldn’t create your account. Please check your details and try again.',
  forgot: 'We couldn’t send a password reset email. Check the email address and try again.',
  reset: 'We couldn’t update your password. The reset link may have expired; request a new one.',
}

export default function AuthPage({ initialMode = 'login', initialError = '' }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError || (supabase ? '' : supabaseConfigurationError))
  const [message, setMessage] = useState('')

  useEffect(() => {
    document.title = `${mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : mode === 'reset' ? 'Choose a new password' : 'Log in'} · Spendly`
  }, [mode])

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setError(supabase ? '' : supabaseConfigurationError)
    setMessage('')
    if (nextMode !== 'reset') navigate('/', { replace: true })
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(supabase ? '' : supabaseConfigurationError)
    setMessage('')
    try {
      if (!supabase) return
      if (mode === 'signup') {
        if (!name.trim()) {
          setError('Enter your name to create an account.')
          return
        }
        if (password !== confirmPassword) {
          setError('Your passwords do not match.')
          return
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } },
        })
        if (signUpError) throw signUpError
        if (data.session) {
          navigate('/', { replace: true })
          return
        }
        setMode('login')
        setMessage('Account created. Check your email to confirm your address, then log in.')
        return
      }

      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
        navigate('/', { replace: true })
        return
      }

      if (mode === 'forgot') {
        const redirectTo = new URL('/reset-password', window.location.origin).toString()
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
        if (recoveryError) throw recoveryError
        setMessage('If an account exists for this email, a password reset link is on its way.')
        return
      }

      if (password !== confirmPassword) {
        setError('Your passwords do not match.')
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : authErrors[mode])
    } finally {
      setBusy(false)
    }
  }

  const isSignup = mode === 'signup'
  const needsPassword = mode === 'login' || isSignup || mode === 'reset'
  const title = {
    login: 'Welcome back',
    signup: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode]

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <a className="auth-brand" href="/" aria-label="Spendly home">
          <span className="auth-brand-mark"><Wallet size={24} /></span>
          <span>Spendly</span>
        </a>
        <p className="auth-tagline">Manage money together, simply.</p>
        <h1 id="auth-heading">{title}</h1>

        <form className="auth-form" onSubmit={submit}>
          {isSignup && (
            <label className="auth-field">
              <span>Name</span>
              <input autoComplete="name" maxLength={60} required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          {mode !== 'reset' && (
            <label className="auth-field">
              <span>Email</span>
              <input autoComplete="email" autoFocus type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          )}
          {needsPassword && (
            <label className="auth-field">
              <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
              <span className="auth-password-input">
                <input autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={6} required type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>
          )}
          {(isSignup || mode === 'reset') && (
            <label className="auth-field">
              <span>Confirm password</span>
              <input autoComplete="new-password" minLength={6} required type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
          )}
          {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
          {message && <p className="auth-feedback auth-message" role="status">{message}</p>}
          <button className="auth-submit" type="submit" disabled={busy || !supabase}>
            {busy ? <><LoaderCircle className="auth-spinner" size={18} /> Please wait…</> : <>
              {mode === 'login' ? 'Log in' : isSignup ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Update password'}
              <ArrowRight size={18} />
            </>}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'login' && <>
            <button type="button" onClick={() => changeMode('forgot')}>Forgot password?</button>
            <p>New to Spendly? <button type="button" onClick={() => changeMode('signup')}>Create account</button></p>
          </>}
          {isSignup && <p>Already have an account? <button type="button" onClick={() => changeMode('login')}>Log in</button></p>}
          {mode === 'forgot' && <button type="button" onClick={() => changeMode('login')}><ArrowLeft size={15} /> Back to log in</button>}
          {mode === 'reset' && <button type="button" onClick={() => changeMode('login')}><ArrowLeft size={15} /> Back to log in</button>}
        </div>
      </section>
      <p className="auth-privacy">Your personal finance data stays in this browser.</p>
    </main>
  )
}
