// ─── LoginGate — early-access PIN gate ────────────────────────────────────────
// Shown to all unauthenticated users. Hides the map until valid credentials.
// Two views: "Регистрация" (get a PIN emailed) and "Вход" (enter PIN).

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { authStore } from './authStore'

type View = 'register' | 'login' | 'check-email'

export function LoginGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState(authStore.getState().status)

  useEffect(() => {
    const unsub = authStore.subscribe(() => setStatus(authStore.getState().status))
    void authStore.init()
    return unsub
  }, [])

  if (status === 'loading')       return <Spinner />
  if (status === 'authenticated') return <>{children}</>
  return <AuthScreen />
}

// ── Spinner shown during silent auto-login check ──────────────────────────────
function Spinner() {
  return (
    <div style={S.root}>
      <div style={S.spinner} />
    </div>
  )
}

// ── Main auth screen ──────────────────────────────────────────────────────────
function AuthScreen() {
  const [view, setView] = useState<View>('register')
  const [regEmail, setRegEmail] = useState('')

  return (
    <div style={S.root}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>
          <img src="/logo_app.png" style={S.logoImg} alt="TesRadar" />
          <div>
            <div style={S.logoTitle}>TesRadar</div>
            <div style={S.logoSub}>Navigate smart</div>
          </div>
        </div>

        <div style={S.divider} />

        {view === 'register' && (
          <RegisterForm
            onRegistered={(email) => { setRegEmail(email); setView('check-email') }}
            onSwitchToLogin={() => setView('login')}
          />
        )}
        {view === 'check-email' && (
          <CheckEmailView
            email={regEmail}
            onLogin={() => setView('login')}
          />
        )}
        {view === 'login' && (
          <LoginForm
            defaultEmail={regEmail}
            onSwitchToRegister={() => setView('register')}
          />
        )}
      </div>

      <p style={S.disclaimer}>
        TesRadar is not affiliated with or endorsed by Tesla, Inc.
      </p>
    </div>
  )
}

// ── Register form ─────────────────────────────────────────────────────────────
function RegisterForm({
  onRegistered,
  onSwitchToLogin,
}: {
  onRegistered: (email: string) => void
  onSwitchToLogin: () => void
}) {
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [teslaModel, setTeslaModel] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  async function handleSubmit() {
    setError('')
    if (!name.trim() || !email.trim()) { setError('Please fill in all required fields.'); return }
    if (!email.includes('@'))          { setError('Please enter a valid email address.'); return }
    setLoading(true)
    const result = await authStore.register(name.trim(), email.trim(), teslaModel.trim())
    setLoading(false)
    if (result.ok) { onRegistered(email.trim().toLowerCase()); return }
    setError(result.error ?? 'Registration error. Please try again.')
  }

  return (
    <>
      <div style={S.heading}>Request Access</div>
      <div style={S.subheading}>
        Register for free — you'll receive a PIN code by email instantly.
      </div>

      <div style={S.field}>
        <label style={S.label}>Name *</label>
        <input
          ref={nameRef}
          style={S.input}
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
      </div>

      <div style={S.field}>
        <label style={S.label}>Email *</label>
        <input
          style={S.input}
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
      </div>

      <div style={S.field}>
        <label style={S.label}>Tesla model</label>
        <input
          style={S.input}
          type="text"
          placeholder="Model 3, Model Y…"
          value={teslaModel}
          onChange={(e) => setTeslaModel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
      </div>

      {error && <div style={S.error}>{error}</div>}

      <button
        style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}
        onClick={() => void handleSubmit()}
        disabled={loading}
      >
        {loading ? 'Sending…' : 'Get my PIN →'}
      </button>

      <p style={S.note}>
        We'll send a PIN to your email — no Tesla account password needed.
      </p>

      <button style={S.switchBtn} onClick={onSwitchToLogin}>
        I have a PIN → Sign in
      </button>
    </>
  )
}

// ── Check-email confirmation ──────────────────────────────────────────────────
function CheckEmailView({ email, onLogin }: { email: string; onLogin: () => void }) {
  return (
    <>
      <div style={{ ...S.heading, fontSize: '1.4rem' }}>Check your inbox ✉</div>
      <div style={S.subheading}>
        We've sent a PIN to <strong style={{ color: '#DA0708' }}>{email}</strong>.
        Enter it on the next screen.
      </div>
      <button style={S.btn} onClick={onLogin}>
        Enter PIN →
      </button>
    </>
  )
}

// ── Login form ────────────────────────────────────────────────────────────────
function LoginForm({
  defaultEmail,
  onSwitchToRegister,
}: {
  defaultEmail: string
  onSwitchToRegister: () => void
}) {
  const [email,   setEmail]   = useState(defaultEmail)
  const [pin,     setPin]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (defaultEmail) pinRef.current?.focus()
  }, [defaultEmail])

  async function handleLogin() {
    setError('')
    if (!email.trim() || !pin.trim()) { setError('Please enter your email and PIN.'); return }
    setLoading(true)
    const result = await authStore.login(email.trim().toLowerCase(), pin.trim())
    setLoading(false)
    if (!result.ok) setError(result.error ?? 'Invalid email or PIN.')
  }

  return (
    <>
      <div style={S.heading}>Sign In</div>
      <div style={S.subheading}>
        Use the email and PIN code you received during registration.
      </div>

      <div style={S.field}>
        <label style={S.label}>Email</label>
        <input
          style={S.input}
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && pinRef.current?.focus()}
        />
      </div>

      <div style={S.field}>
        <label style={S.label}>PIN code</label>
        <input
          ref={pinRef}
          style={{ ...S.input, letterSpacing: '0.3em', fontFamily: 'monospace', fontSize: '1.2rem' }}
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="••••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
        />
      </div>

      {error && <div style={S.error}>{error}</div>}

      <button
        style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}
        onClick={() => void handleLogin()}
        disabled={loading}
      >
        {loading ? 'Verifying…' : 'Sign in →'}
      </button>

      <button style={S.switchBtn} onClick={onSwitchToRegister}>
        No PIN yet → Register
      </button>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    position:       'fixed',
    inset:          0,
    background:     '#080b10',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         9999,
    padding:        '16px',
    overflowY:      'auto',
  },
  spinner: {
    width:        '36px',
    height:       '36px',
    borderRadius: '50%',
    border:       '3px solid rgba(218,7,8,0.2)',
    borderTop:    '3px solid #DA0708',
    animation:    'tesradar-spin 0.7s linear infinite',
  },
  card: {
    background:   '#0f1318',
    border:       '1px solid rgba(218,7,8,0.22)',
    borderRadius: '16px',
    padding:      '28px 24px',
    width:        '100%',
    maxWidth:     '420px',
    boxShadow:    '0 0 48px rgba(218,7,8,0.09)',
  },
  logo: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
    marginBottom: '4px',
  },
  logoImg: {
    width:        '56px',
    height:       '56px',
    objectFit:    'contain',
    flexShrink:   0,
  },
  logoTitle: {
    fontSize:   '1.4rem',
    fontWeight: 700,
    color:      '#f1f5f9',
    letterSpacing: '-0.02em',
  },
  logoSub: {
    fontSize: '0.75rem',
    color:    '#6b7280',
    marginTop: '1px',
  },
  divider: {
    height:     '1px',
    background: 'rgba(218,7,8,0.15)',
    margin:     '20px 0',
  },
  heading: {
    fontSize:   '1.55rem',
    fontWeight: 700,
    color:      '#f1f5f9',
    marginBottom: '6px',
    letterSpacing: '-0.02em',
  },
  subheading: {
    fontSize:  '0.83rem',
    color:     '#9ca3af',
    lineHeight: 1.5,
    marginBottom: '20px',
  },
  field: {
    marginBottom: '14px',
  },
  label: {
    display:      'block',
    fontSize:     '0.72rem',
    fontWeight:   600,
    color:        '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '5px',
  },
  input: {
    width:        '100%',
    background:   '#161b24',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding:      '12px 14px',
    color:        '#f1f5f9',
    fontSize:     '0.95rem',
    fontFamily:   'inherit',
    outline:      'none',
    boxSizing:    'border-box',
    WebkitAppearance: 'none',
    appearance:   'none',
  },
  btn: {
    width:        '100%',
    background:   'linear-gradient(135deg, #DA0708, #b80006)',
    border:       'none',
    borderRadius: '10px',
    padding:      '14px',
    color:        '#fff',
    fontSize:     '1rem',
    fontWeight:   700,
    cursor:       'pointer',
    fontFamily:   'inherit',
    letterSpacing: '0.01em',
    marginTop:    '4px',
    WebkitTapHighlightColor: 'transparent',
    touchAction:  'manipulation',
  },
  note: {
    fontSize:  '0.73rem',
    color:     '#6b7280',
    textAlign: 'center',
    margin:    '10px 0 4px',
    lineHeight: 1.4,
  },
  switchBtn: {
    display:    'block',
    width:      '100%',
    background: 'none',
    border:     'none',
    color:      '#DA0708',
    fontSize:   '0.85rem',
    fontWeight: 600,
    cursor:     'pointer',
    padding:    '10px',
    marginTop:  '4px',
    fontFamily: 'inherit',
    textAlign:  'center',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  error: {
    background:   'rgba(239,68,68,0.1)',
    border:       '1px solid rgba(239,68,68,0.3)',
    borderRadius: '7px',
    padding:      '9px 12px',
    color:        '#fca5a5',
    fontSize:     '0.82rem',
    marginBottom: '10px',
  },
  disclaimer: {
    marginTop: '16px',
    fontSize:  '0.68rem',
    color:     '#374151',
    textAlign: 'center',
  },
}

// Inject keyframe for spinner
if (typeof document !== 'undefined') {
  const id = 'tesradar-login-styles'
  if (!document.getElementById(id)) {
    const st = document.createElement('style')
    st.id = id
    st.textContent = `@keyframes tesradar-spin { to { transform: rotate(360deg); } }
      #tesradar-login-gate input:focus { border-color: #DA0708 !important; box-shadow: 0 0 0 2px rgba(218,7,8,0.3) !important; }`
    document.head.appendChild(st)
  }
}
