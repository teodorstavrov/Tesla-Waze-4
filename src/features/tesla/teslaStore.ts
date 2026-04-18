// ─── Tesla connection store ────────────────────────────────────────────────
// Holds the current Tesla connection state (connected / disconnected / loading).
// Uses the same minimal pub/sub pattern as all other stores in this app.
//
// IMPORTANT: this store never holds Tesla tokens. It only holds safe metadata
// fetched from /api/tesla/status (vehicleName, vehicleId, connected flag).
// Tokens live only in Redis on the backend.

export interface TeslaConnectionState {
  connected:   boolean
  vehicleName: string | null
  vehicleId:   string | null
  loading:     boolean
  error:       'denied' | 'server_error' | 'unknown' | null
}

type Listener = () => void

const _listeners = new Set<Listener>()

let _state: TeslaConnectionState = {
  connected:   false,
  vehicleName: null,
  vehicleId:   null,
  loading:     false,
  error:       null,
}

function _emit(): void { _listeners.forEach((fn) => fn()) }

export const teslaStore = {
  getState(): TeslaConnectionState { return _state },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  },

  /**
   * Fetch connection status from the backend and update store.
   * Called on app start and after OAuth redirect returns.
   */
  async checkStatus(): Promise<void> {
    _state = { ..._state, loading: true, error: null }
    _emit()
    try {
      const res = await fetch('/api/tesla/status', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = (await res.json()) as {
        connected:    boolean
        vehicleName?: string | null
        vehicleId?:   string | null
      }
      _state = {
        connected:   data.connected,
        vehicleName: data.vehicleName ?? null,
        vehicleId:   data.vehicleId   ?? null,
        loading:     false,
        error:       null,
      }
    } catch {
      _state = { ..._state, loading: false }
    }
    _emit()
  },

  /** Redirect the browser to initiate the Tesla OAuth flow. */
  startConnect(): void {
    window.location.href = '/api/tesla/connect'
  },

  /** Revoke tokens server-side and clear local state. */
  async disconnect(): Promise<void> {
    _state = { ..._state, loading: true }
    _emit()
    try {
      await fetch('/api/tesla/disconnect', {
        method:      'POST',
        credentials: 'same-origin',
      })
    } catch {
      // best-effort
    }
    _state = {
      connected:   false,
      vehicleName: null,
      vehicleId:   null,
      loading:     false,
      error:       null,
    }
    _emit()
  },

  /** Called by App.tsx when URL param signals a connect error. */
  setError(error: TeslaConnectionState['error']): void {
    _state = { ..._state, loading: false, error }
    _emit()
  },
}
