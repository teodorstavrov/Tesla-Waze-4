// ─── Search bar ────────────────────────────────────────────────────────
// Phase 7: geocoding (Nominatim) + local EV station search.
//
// UX:
//   • Click search icon → expands to text input with results dropdown
//   • 400ms debounce → parallel Nominatim + local station search
//   • Click result → pan map (geo) or open station panel + pan (station)
//   • Click outside / Escape / ✕ → collapse
//
// Closing: handled by a document mousedown listener (not onBlur) so
// clicking a result doesn't close before the click fires.

import { useState, useEffect, useRef, useCallback } from 'react'
import { getMap } from '@/components/MapShell'
import { evStore } from '@/features/ev/evStore'
import { routeStore } from '@/features/route/routeStore'
import { searchNominatim } from '@/features/search/nominatim'
import { searchStations } from '@/features/search/stationSearch'
import type { GeoResult } from '@/features/search/nominatim'
import type { StationResult } from '@/features/search/stationSearch'
import type { NormalizedStation } from '@/features/ev/types'

type SearchResult = (GeoResult & { _city?: string }) | StationResult

const SOURCE_COLOR: Record<string, string> = {
  tesla: '#e31937', ocm: '#2B7FFF', osm: '#22c55e',
}

// ─────────────────────────────────────────────────────────────────

export function SearchBar() {
  const [open, setOpen]         = useState(false)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<SearchResult[]>([])
  const [busy, setBusy]         = useState(false)
  const [focused, setFocused]   = useState(-1)  // keyboard nav index

  const inputRef    = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef    = useRef<AbortController | null>(null)

  // ── Open/close helpers ───────────────────────────────────────────
  function openSearch() {
    setOpen(true)
    setQuery('')
    setResults([])
    setFocused(-1)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const closeSearch = useCallback(() => {
    abortRef.current?.abort()
    setOpen(false)
    setQuery('')
    setResults([])
    setBusy(false)
    setFocused(-1)
  }, [])

  // ── Close on click outside ───────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) closeSearch()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open, closeSearch])

  // ── Escape key ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSearch()
      if (e.key === 'ArrowDown') setFocused((f) => Math.min(f + 1, results.length - 1))
      if (e.key === 'ArrowUp')   setFocused((f) => Math.max(f - 1, 0))
      if (e.key === 'Enter' && focused >= 0) selectResult(results[focused]!)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeSearch, results, focused])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced search ─────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setResults([]); setBusy(false); return }

    setBusy(true)
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      try {
        const [geoSettled] = await Promise.allSettled([
          searchNominatim(query, abortRef.current.signal),
        ])
        const stationMatches = searchStations(query)
        const geoMatches = geoSettled.status === 'fulfilled' ? geoSettled.value : []

        setResults([...stationMatches, ...geoMatches])
        setFocused(-1)
      } catch {
        // AbortError or network — silently clear
      } finally {
        setBusy(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [query])

  // ── Select result ────────────────────────────────────────────────
  function selectResult(result: SearchResult) {
    const map = getMap()
    if (!map) return

    if (result.type === 'station') {
      const s = result.station
      evStore.selectStation(s)
      map.setView([s.lat, s.lng], Math.max(map.getZoom(), 15), { animate: true })
    } else {
      // Geocoding result — offer to navigate or just pan
      map.setView([result.lat, result.lng], 15, { animate: true })
      void routeStore.navigateTo({ lat: result.lat, lng: result.lng, name: result.shortName })
    }

    closeSearch()
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 400,
        width: open ? 'min(380px, calc(100vw - 24px))' : 'auto',
        transition: 'width 0.18s ease',
      }}
    >
      {!open
        ? (
          <button
            className="icon-btn"
            onClick={openSearch}
            aria-label="Open search"
            title="Search"
          >
            <SearchIcon />
          </button>
        )
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Input row */}
            <div
              className="glass"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}
            >
              {busy
                ? <SpinnerIcon />
                : <SearchIcon style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              }
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search places or charging stations…"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: 14, padding: '2px 0', minWidth: 0,
                }}
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); closeSearch() }}
                aria-label="Close search"
                style={{
                  background: 'none', border: 'none', color: 'var(--text-secondary)',
                  cursor: 'pointer', padding: 4, lineHeight: 1, flexShrink: 0, fontSize: 16,
                }}
              >
                ✕
              </button>
            </div>

            {/* Results dropdown */}
            {results.length > 0 && (
              <div
                className="glass"
                style={{
                  marginTop: 6,
                  maxHeight: 320,
                  overflowY: 'auto',
                  borderRadius: 12,
                  padding: '4px 0',
                }}
              >
                {/* Station results */}
                {results.filter((r) => r.type === 'station').length > 0 && (
                  <>
                    <SectionLabel label="Charging stations" />
                    {results
                      .filter((r): r is StationResult => r.type === 'station')
                      .map((r, i) => (
                        <ResultRow
                          key={r.station.id}
                          focused={focused === i}
                          onClick={() => selectResult(r)}
                        >
                          <StationResultContent result={r} />
                        </ResultRow>
                      ))
                    }
                  </>
                )}

                {/* Geo results */}
                {results.filter((r) => r.type === 'geo').length > 0 && (
                  <>
                    <SectionLabel label="Places" />
                    {results
                      .filter((r): r is GeoResult & { _city?: string } => r.type === 'geo')
                      .map((r, i) => {
                        const idx = results.filter((x) => x.type === 'station').length + i
                        return (
                          <ResultRow
                            key={`${r.lat},${r.lng}`}
                            focused={focused === idx}
                            onClick={() => selectResult(r)}
                          >
                            <GeoResultContent result={r} />
                          </ResultRow>
                        )
                      })
                    }
                  </>
                )}
              </div>
            )}

            {/* Empty state */}
            {!busy && query.trim() && results.length === 0 && (
              <div
                className="glass"
                style={{
                  marginTop: 6, padding: '14px 16px',
                  fontSize: 13, color: 'var(--text-secondary)',
                  textAlign: 'center',
                }}
              >
                No results for "{query}"
              </div>
            )}
          </div>
        )
      }
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      padding: '6px 14px 2px',
      fontSize: 10, fontWeight: 700,
      color: 'var(--text-secondary)',
      letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>
      {label}
    </div>
  )
}

function ResultRow({
  children, focused, onClick,
}: {
  children: React.ReactNode
  focused: boolean
  onClick: () => void
}) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      role="option"
      aria-selected={focused}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}  // prevent input blur
      style={{
        padding: '9px 14px',
        cursor: 'pointer',
        background: focused ? 'rgba(255,255,255,0.07)' : 'transparent',
        transition: 'background 0.1s',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = focused ? 'rgba(255,255,255,0.07)' : 'transparent' }}
    >
      {children}
    </div>
  )
}

function StationResultContent({ result }: { result: StationResult }) {
  const s: NormalizedStation = result.station
  const color = SOURCE_COLOR[s.source] ?? '#888'
  return (
    <>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: `${color}22`, border: `1.5px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12,
      }}>
        ⚡
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {s.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
          {result.subtitle}
        </div>
      </div>
    </>
  )
}

function GeoResultContent({ result }: { result: GeoResult & { _city?: string } }) {
  const subtitle = result._city && result._city !== result.shortName
    ? result._city
    : result.displayName.split(',').slice(1, 3).join(',').trim()

  return (
    <>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13,
      }}>
        📍
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {result.shortName}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 11, color: 'var(--text-secondary)', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </>
  )
}

function SearchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round"
      style={{ flexShrink: 0, animation: 'spin 0.8s linear infinite' }}
      aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
