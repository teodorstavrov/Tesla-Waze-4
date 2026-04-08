// ─── Error Boundary ─────────────────────────────────────────────────────
// Catches unhandled React render errors and shows a recovery screen
// instead of a blank page. Critical for Tesla browser where the user
// cannot easily reload — the button gives them a way out.

import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { captureError } from '@/lib/sentry'

interface Props  { children: ReactNode }
interface State  { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
    captureError(error, 'ErrorBoundary')
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: '#0a0a0f',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32, gap: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>⚡</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
          Something went wrong
        </div>
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.45)',
          maxWidth: 340, lineHeight: 1.6,
        }}>
          {error.message}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: '12px 28px',
            borderRadius: 10,
            background: '#e31937',
            border: 'none',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
