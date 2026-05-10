// ─── UI visibility store ────────────────────────────────────────────────────
// Persists show/hide prefs for right controls and clock.
// settingsOpen is session-only (not persisted).

type Persisted = {
  showRightControls: boolean
  showClock:         boolean
}

type State = Persisted & { settingsOpen: boolean }

const LS_KEY = 'tesradar:ui'

function load(): Persisted {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (s) {
      const p = JSON.parse(s) as Partial<Persisted>
      return {
        showRightControls: p.showRightControls ?? true,
        showClock:         p.showClock ?? true,
      }
    }
  } catch { /* ignore */ }
  return { showRightControls: true, showClock: true }
}

function persist(s: Persisted): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* quota */ }
}

type Listener = () => void

class UiStore {
  private state: State = { ...load(), settingsOpen: false }
  private listeners = new Set<Listener>()

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getState = (): State => this.state

  private set(partial: Partial<State>): void {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach(fn => fn())
  }

  openSettings   = (): void => { this.set({ settingsOpen: true }) }
  closeSettings  = (): void => { this.set({ settingsOpen: false }) }
  toggleSettings = (): void => { this.set({ settingsOpen: !this.state.settingsOpen }) }

  toggleRightControls = (): void => {
    const next = !this.state.showRightControls
    this.set({ showRightControls: next })
    persist({ showRightControls: next, showClock: this.state.showClock })
  }

  toggleClock = (): void => {
    const next = !this.state.showClock
    this.set({ showClock: next })
    persist({ showRightControls: this.state.showRightControls, showClock: next })
  }
}

export const uiStore = new UiStore()
