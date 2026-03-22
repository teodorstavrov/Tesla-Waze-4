import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light'
export type MapMode = 'normal' | 'satellite'

interface ThemeState {
  theme: ThemeMode
  mapMode: MapMode
  toggleTheme: () => void
  toggleSatellite: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      mapMode: 'normal',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      toggleSatellite: () => set((s) => ({ mapMode: s.mapMode === 'satellite' ? 'normal' : 'satellite' })),
    }),
    {
      name: 'tesla-theme',
      partialize: (s) => ({ theme: s.theme, mapMode: s.mapMode }),
    },
  ),
)
