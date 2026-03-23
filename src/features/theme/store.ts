import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light'
export type MapMode = 'normal' | 'satellite'

// Dark hours: 19:00 – 07:00
function autoThemeForHour(hour: number): ThemeMode {
  return hour >= 7 && hour < 19 ? 'light' : 'dark'
}

interface ThemeState {
  theme: ThemeMode
  mapMode: MapMode
  manualTheme: boolean  // true once user explicitly toggles — disables auto
  toggleTheme: () => void
  toggleSatellite: () => void
  applyAutoTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: autoThemeForHour(new Date().getHours()),
      mapMode: 'normal',
      manualTheme: false,
      toggleTheme: () => set((s) => ({
        theme: s.theme === 'dark' ? 'light' : 'dark',
        manualTheme: true,
      })),
      toggleSatellite: () => set((s) => ({ mapMode: s.mapMode === 'satellite' ? 'normal' : 'satellite' })),
      applyAutoTheme: () => {
        if (get().manualTheme) return
        set({ theme: autoThemeForHour(new Date().getHours()) })
      },
    }),
    {
      name: 'tesla-theme',
      partialize: (s) => ({ theme: s.theme, mapMode: s.mapMode, manualTheme: s.manualTheme }),
    },
  ),
)
