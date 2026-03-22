// ─── React hook: audio unlock state + trigger ─────────────────────────
import { useSyncExternalStore, useCallback } from 'react'
import { audioManager } from './audioManager'
import type { AudioState } from './audioManager'

export interface UseAudioUnlock extends AudioState {
  /** Call this from any user gesture handler to unlock audio */
  unlock: () => void
}

export function useAudioUnlock(): UseAudioUnlock {
  const state = useSyncExternalStore(
    (cb) => audioManager.subscribe(() => { cb() }),
    () => audioManager.getState(),
    () => audioManager.getState(),
  )

  const unlock = useCallback(() => {
    void audioManager.tryUnlock()
  }, [])

  return { ...state, unlock }
}
