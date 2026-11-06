// ─── Auth store — PIN-based early access gate ─────────────────────────────────
// Persists email + PIN in localStorage. On mount verifies silently against API.

const LS_KEY = 'tesradar_auth'

export interface AuthCredentials {
  email: string
  pin:   string
  name:  string
}

type Listener = () => void

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  name:   string | null
  email:  string | null
}

let _state: AuthState = { status: 'loading', name: null, email: null }
const _listeners = new Set<Listener>()

function notify() { _listeners.forEach((fn) => fn()) }

function setState(next: Partial<AuthState>) {
  _state = { ..._state, ...next }
  notify()
}

function getSaved(): AuthCredentials | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as AuthCredentials) : null
  } catch {
    return null
  }
}

function save(creds: AuthCredentials) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(creds)) } catch { /* noop */ }
}

function clear() {
  try { localStorage.removeItem(LS_KEY) } catch { /* noop */ }
}

async function verify(email: string, pin: string): Promise<{ ok: boolean; name?: string }> {
  try {
    const r = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, pin }),
    })
    if (r.ok) {
      const data = await r.json() as { ok: boolean; name: string }
      return { ok: true, name: data.name }
    }
    return { ok: false }
  } catch {
    // Network error — treat as authenticated to avoid blocking offline users
    return { ok: true }
  }
}

// Called once on app mount
async function init() {
  const saved = getSaved()
  if (!saved) {
    setState({ status: 'unauthenticated' })
    return
  }
  const result = await verify(saved.email, saved.pin)
  if (result.ok) {
    setState({ status: 'authenticated', name: result.name ?? saved.name, email: saved.email })
  } else {
    clear()
    setState({ status: 'unauthenticated' })
  }
}

async function login(email: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const result = await verify(email, pin)
  if (!result.ok) return { ok: false, error: 'Невалиден имейл или PIN.' }
  save({ email, pin, name: result.name ?? '' })
  setState({ status: 'authenticated', name: result.name ?? null, email })
  return { ok: true }
}

async function register(
  name: string, email: string, teslaModel: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, teslaModel }),
    })
    if (r.ok) return { ok: true }
    const data = await r.json() as { error?: string }
    return { ok: false, error: data.error ?? 'Грешка при регистрация.' }
  } catch {
    return { ok: false, error: 'Мрежова грешка. Провери интернет.' }
  }
}

export const authStore = {
  getState: () => _state,
  subscribe: (fn: Listener) => { _listeners.add(fn); return () => _listeners.delete(fn) },
  init,
  login,
  register,
}
