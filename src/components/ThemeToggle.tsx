// ─── Night mode toggle: dark standard map ↔ voyager day ───────────────
import { useThemeStore } from '@/features/theme/store'

export function ThemeToggle() {
  const { theme, mapMode, toggleNight } = useThemeStore()
  const isNight = theme === 'dark' && mapMode === 'normal'

  return (
    <button
      className={`icon-btn${isNight ? ' active' : ''}`}
      onClick={toggleNight}
      title={isNight ? 'Дневен режим' : 'Нощен режим'}
      aria-label={isNight ? 'Превключи към дневен режим' : 'Превключи към нощен режим'}
      aria-pressed={isNight}
    >
      {isNight ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
