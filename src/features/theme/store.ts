import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { gpsStore } from '@/features/gps/gpsStore'

export type ThemeMode = 'dark' | 'light'
export type MapMode = 'normal' | 'voyager' | 'satellite'

// Sunrise/sunset via simplified NOAA algorithm — no external deps
function _sunTimes(lat: number, lng: number): { sunrise: number; sunset: number } {
  const RAD  = Math.PI / 180
  const now  = new Date()
  const J    = now.getTime() / 86400000 + 2440587.5
  const n    = Math.round(J - 2451545.0 + 0.0008)
  const Js   = n - lng / 360
  const M    = ((357.5291 + 0.98560028 * Js) % 360 + 360) % 360
  const C    = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD)
  const lam  = ((M + C + 180 + 102.9372) % 360 + 360) % 360
  const Jt   = 2451545.0 + Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lam * RAD)
  const sinD = Math.sin(lam * RAD) * Math.sin(23.4397 * RAD)
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinD)
             / (Math.cos(lat * RAD) * Math.cos(Math.asin(sinD)))
  if (cosW <= -1) return { sunrise: 0,  sunset: 24 }   // midnight sun
  if (cosW >= 1)  return { sunrise: 12, sunset: 12 }   // polar night
  const omega   = Math.acos(cosW) / RAD
  const utcOff  = -now.getTimezoneOffset() / 60
  const toLocal = (jd: number) => (((jd + 0.5) % 1) * 24 + utcOff + 48) % 24
  return { sunrise: toLocal(Jt - omega / 360), sunset: toLocal(Jt + omega / 360) }
}

function _autoTheme(): ThemeMode {
  const now = new Date()
  const hr  = now.getHours() + now.getMinutes() / 60
  const pos = gpsStore.getPosition()
  if (pos) {
    const { sunrise, sunset } = _sunTimes(pos.lat, pos.lng)
    return hr >= sunrise && hr < sunset ? 'light' : 'dark'
  }
  // Fallback when GPS not yet available: fixed hours 07:00–19:00
  return hr >= 7 && hr < 19 ? 'light' : 'dark'
}

interface ThemeState {
  theme: ThemeMode
  mapMode: MapMode
  manualTheme: boolean  // true once user explicitly toggles — disables auto
  toggleTheme: () => void
  toggleSatellite: () => void
  toggleNight: () => void
  applyAutoTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: _autoTheme(),
      mapMode: 'voyager',
      manualTheme: false,
      toggleTheme: () => set((s) => ({
        theme: s.theme === 'dark' ? 'light' : 'dark',
        manualTheme: true,
      })),
      toggleSatellite: () => set((s) => ({
        mapMode: s.mapMode === 'satellite' ? 'voyager' : 'satellite',
      })),
      // Night mode: dark standard map ↔ voyager day
      toggleNight: () => set((s) => {
        const isNight = s.theme === 'dark' && s.mapMode === 'normal'
        return isNight
          ? { theme: 'light', mapMode: 'voyager', manualTheme: true }
          : { theme: 'dark',  mapMode: 'normal',  manualTheme: true }
      }),
      applyAutoTheme: () => {
        if (get().manualTheme) return
        set({ theme: _autoTheme() })
      },
    }),
    {
      name: 'tesla-theme',
      partialize: (s) => ({ theme: s.theme, mapMode: s.mapMode, manualTheme: s.manualTheme }),
    },
  ),
)
