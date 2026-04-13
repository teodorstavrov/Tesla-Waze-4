// ─── Search bar ────────────────────────────────────────────────────────
// Phase 7:  geocoding (Nominatim) + local EV station search.
// Phase 24: search history (localStorage) + viewbox bias for Nominatim.
//
// UX:
//   • Click search icon → expands; shows history if no text typed
//   • 400ms debounce → parallel Nominatim (viewbox-biased) + local station search
//   • Click result → pan map (geo) or open station panel + pan (station)
//   • Geo results are saved to history (max 5, deduplicated by coords)
//   • Click outside / Escape / ✕ → collapse

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSyncExternalStore } from 'react'
import { t, getLang, langStore } from '@/lib/locale'
import { getMap } from '@/components/MapShell'
import { evStore } from '@/features/ev/evStore'
import { routeStore } from '@/features/route/routeStore'
import { searchNominatim } from '@/features/search/nominatim'
import { searchStations } from '@/features/search/stationSearch'
import {
  loadHistory, saveToHistory, removeFromHistory,
  loadFavorites, isFavorite, toggleFavorite,
} from '@/features/search/searchHistory'
import { savedPlacesStore } from '@/features/places/savedPlacesStore'
import type { GeoResult } from '@/features/search/nominatim'
import type { StationResult } from '@/features/search/stationSearch'
import type { HistoryEntry } from '@/features/search/searchHistory'
import type { NormalizedStation } from '@/features/ev/types'
import type { PlaceType } from '@/features/places/savedPlacesStore'

type SearchResult = (GeoResult & { _city?: string }) | StationResult

const SOURCE_COLOR: Record<string, string> = {
  tesla: '#e31937', ocm: '#2B7FFF', osm: '#22c55e',
}

// ─────────────────────────────────────────────────────────────────

export function SearchBar() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const [open, setOpen]         = useState(false)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<SearchResult[]>([])
  const [busy, setBusy]         = useState(false)
  const [focused, setFocused]   = useState(-1)
  const [history, setHistory]   = useState<HistoryEntry[]>([])
  const [favorites, setFavorites] = useState<HistoryEntry[]>([])
  const [savedPlaces, setSavedPlaces] = useState(() => savedPlacesStore.getAll())
  // Used to force re-render after star toggle without closing the panel
  const [, setFavTick] = useState(0)

  const inputRef     = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef     = useRef<AbortController | null>(null)

  // Keep savedPlaces in sync (Home/Work can be set from map long-press)
  useEffect(() => savedPlacesStore.subscribe(() => setSavedPlaces(savedPlacesStore.getAll())), [])

  // ── Open/close helpers ───────────────────────────────────────────
  function openSearch() {
    setOpen(true)
    setQuery('')
    setResults([])
    setFocused(-1)
    setHistory(loadHistory())
    setFavorites(loadFavorites())
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const closeSearch = useCallback(() => {
    abortRef.current?.abort()
    setOpen(false)
    setQuery('')
    setResults([])
    setBusy(false)
    setFocused(-1)
    setHistory([])
    setFavorites([])
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

  // ── Escape / arrow keys ──────────────────────────────────────────
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

      // Viewbox from current map extent — biases Nominatim toward visible area
      const map = getMap()
      let viewbox: string | undefined
      if (map) {
        const b = map.getBounds()
        viewbox = `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`
      }

      try {
        const [geoSettled] = await Promise.allSettled([
          searchNominatim(query, abortRef.current.signal, viewbox),
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
      // Do NOT call map.setView here — RouteLayer.fitBounds will center the
      // full route once loaded. Calling setView first causes follow-mode to
      // override fitBounds before the route arrives.
      void routeStore.navigateTo({ lat: result.lat, lng: result.lng, name: result.shortName })
      // Save to history
      saveToHistory({
        shortName:   result.shortName,
        displayName: result.displayName,
        lat:         result.lat,
        lng:         result.lng,
      })
    }

    closeSearch()
  }

  // ── Select history/favorite entry ───────────────────────────────
  function selectHistory(entry: HistoryEntry) {
    const map = getMap()
    if (!map) return
    void routeStore.navigateTo({ lat: entry.lat, lng: entry.lng, name: entry.shortName })
    saveToHistory({ shortName: entry.shortName, displayName: entry.displayName, lat: entry.lat, lng: entry.lng })
    closeSearch()
  }

  // ── Star toggle — keeps dropdown open ───────────────────────────
  function handleStarToggle(e: React.MouseEvent, entry: HistoryEntry) {
    e.stopPropagation()
    toggleFavorite({ shortName: entry.shortName, displayName: entry.displayName, lat: entry.lat, lng: entry.lng })
    setFavorites(loadFavorites())
    setHistory(loadHistory())
    setFavTick((t) => t + 1)
  }

  // ── Remove from history ──────────────────────────────────────────
  function handleRemoveHistory(e: React.MouseEvent, entry: HistoryEntry) {
    e.stopPropagation()
    removeFromHistory(entry.lat, entry.lng)
    setHistory(loadHistory())
  }

  // ── Navigate to saved place (Home / Work) ────────────────────────
  function selectSavedPlace(type: PlaceType) {
    const place = savedPlacesStore.get(type)
    if (!place) return
    void routeStore.navigateTo({ lat: place.lat, lng: place.lng, name: place.name })
    closeSearch()
  }

  // ── Star toggle directly from search results ─────────────────────
  function handleResultStarToggle(e: React.MouseEvent, result: GeoResult) {
    e.stopPropagation()
    toggleFavorite({
      shortName:   result.shortName,
      displayName: result.displayName,
      lat:         result.lat,
      lng:         result.lng,
    })
    setFavorites(loadFavorites())
    setFavTick((n) => n + 1)
  }

  // ── Render ───────────────────────────────────────────────────────
  // Show empty-query dropdown always — even with no history, so Home/Work
  // placeholders are visible and discoverable on first use.
  const showHistory  = open && !query.trim()
  const showResults  = results.length > 0
  // History entries that are NOT also favorites (to avoid duplication)
  const historyOnly  = history.filter((h) => !isFavorite(h.lat, h.lng))

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
            aria-label={t('search.open')}
            title={t('search.searchTitle')}
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
                placeholder={t('search.placeholder')}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: 14, padding: '2px 0', minWidth: 0,
                }}
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); closeSearch() }}
                aria-label={t('search.close')}
                style={{
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  padding: 0, borderRadius: 8, lineHeight: 1, flexShrink: 0,
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            </div>

            {/* History + Favorites + Home/Work dropdown */}
            {showHistory && (
              <div
                className="glass"
                style={{
                  marginTop: 6, maxHeight: 360, overflowY: 'auto',
                  borderRadius: 12, padding: '4px 0',
                }}
              >
                {/* Home & Work quick navigation — always visible */}
                <SectionLabel label={`${t('map.home')} & ${t('map.work')}`} />
                <ResultRow focused={false} onClick={() => savedPlaces.home ? selectSavedPlace('home') : undefined}>
                  <SavedPlaceContent
                    type="home"
                    name={savedPlaces.home ? savedPlaces.home.name : null}
                  />
                </ResultRow>
                <ResultRow focused={false} onClick={() => savedPlaces.work ? selectSavedPlace('work') : undefined}>
                  <SavedPlaceContent
                    type="work"
                    name={savedPlaces.work ? savedPlaces.work.name : null}
                  />
                </ResultRow>

                {/* Favorites section */}
                {favorites.length > 0 && (
                  <>
                    <SectionLabel label={t('search.favorites')} />
                    {favorites.map((entry) => (
                      <ResultRow
                        key={`fav-${entry.lat},${entry.lng}`}
                        focused={false}
                        onClick={() => selectHistory(entry)}
                      >
                        <HistoryResultContent
                          entry={entry}
                          starred={true}
                          onStar={(e) => handleStarToggle(e, entry)}
                          onRemove={undefined}
                        />
                      </ResultRow>
                    ))}
                  </>
                )}

                {/* Recent (non-favorites) section */}
                {historyOnly.length > 0 && (
                  <>
                    <SectionLabel label={t('search.recent')} />
                    {historyOnly.map((entry) => (
                      <ResultRow
                        key={`hist-${entry.lat},${entry.lng}`}
                        focused={false}
                        onClick={() => selectHistory(entry)}
                      >
                        <HistoryResultContent
                          entry={entry}
                          starred={false}
                          onStar={(e) => handleStarToggle(e, entry)}
                          onRemove={(e) => handleRemoveHistory(e, entry)}
                        />
                      </ResultRow>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Results dropdown */}
            {showResults && (
              <div
                className="glass"
                style={{
                  marginTop: 6, maxHeight: 320, overflowY: 'auto',
                  borderRadius: 12, padding: '4px 0',
                }}
              >
                {/* Station results */}
                {results.filter((r) => r.type === 'station').length > 0 && (
                  <>
                    <SectionLabel label={t('search.stations')} />
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
                    <SectionLabel label={t('search.places')} />
                    {results
                      .filter((r): r is GeoResult & { _city?: string } => r.type === 'geo')
                      .map((r, i) => {
                        const idx = results.filter((x) => x.type === 'station').length + i
                        const starred = isFavorite(r.lat, r.lng)
                        return (
                          <ResultRow
                            key={`${r.lat},${r.lng}`}
                            focused={focused === idx}
                            onClick={() => selectResult(r)}
                          >
                            <GeoResultContent
                              result={r}
                              starred={starred}
                              onStar={(e) => handleResultStarToggle(e, r)}
                            />
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
                {t('search.noResults')} &ldquo;{query}&rdquo;
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

function HistoryResultContent({
  entry, starred, onStar, onRemove,
}: {
  entry:    HistoryEntry
  starred:  boolean
  onStar:   (e: React.MouseEvent) => void
  onRemove: ((e: React.MouseEvent) => void) | undefined
}) {
  const subtitle = entry.displayName.split(',').slice(1, 3).join(',').trim()
  return (
    <>
      {/* Icon */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: starred ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1.5px solid ${starred ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.15)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {starred ? <StarFilledIcon /> : <HistoryIcon />}
      </div>

      {/* Text */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {entry.shortName}
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

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
        {/* Star / unstar */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onStar}
          aria-label={starred ? t('search.removeFav') : t('search.addFav')}
          title={starred ? t('search.removeFav') : t('search.addFav')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 6, lineHeight: 1,
            color: starred ? '#fbbf24' : 'rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center',
          }}
        >
          {starred ? <StarFilledIcon size={14} /> : <StarOutlineIcon size={14} />}
        </button>

        {/* Remove from history (only for non-favorites) */}
        {onRemove && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
            aria-label={t('search.removeHist')}
            title={t('search.remove')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 6, lineHeight: 1,
              color: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        )}
      </div>
    </>
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

function SavedPlaceContent({ type, name }: { type: PlaceType; name: string | null }) {
  const isHome  = type === 'home'
  const isSet   = name !== null
  const color   = isHome ? '#22c55e' : '#3b82f6'
  const emoji   = isHome ? '🏠' : '💼'
  const label   = isHome ? t('map.home') : t('map.work')
  const setLabel = isHome ? t('map.setHome') : t('map.setWork')
  return (
    <>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isSet ? `${color}20` : 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${isSet ? color : 'rgba(255,255,255,0.15)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, opacity: isSet ? 1 : 0.5,
      }}>
        {emoji}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: isSet ? 'var(--text-primary)' : 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 11, color: isSet ? 'var(--text-secondary)' : 'rgba(255,255,255,0.3)',
          marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          fontStyle: isSet ? 'normal' : 'italic',
        }}>
          {isSet ? name : setLabel}
        </div>
      </div>
      {isSet && (
        <div style={{ fontSize: 11, color: color, fontWeight: 600, flexShrink: 0 }}>
          ↗
        </div>
      )}
    </>
  )
}

function GeoResultContent({
  result, starred, onStar,
}: {
  result:   GeoResult & { _city?: string }
  starred?: boolean
  onStar?:  (e: React.MouseEvent) => void
}) {
  const subtitle = result._city && result._city !== result.shortName
    ? result._city
    : result.displayName.split(',').slice(1, 3).join(',').trim()

  // Use road icon for highway/road results
  const isStreet = result.category === 'highway' || result.category === 'road'

  return (
    <>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13,
      }}>
        {isStreet ? '🛣️' : '📍'}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
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

      {/* Star — save to favourites directly from search results */}
      {onStar && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onStar}
          aria-label={starred ? t('search.removeFav') : t('search.addFav')}
          title={starred ? t('search.removeFav') : t('search.addFav')}
          style={{
            background: starred ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${starred ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.12)'}`,
            cursor: 'pointer',
            padding: 0, borderRadius: 8, lineHeight: 1, flexShrink: 0,
            color: starred ? '#fbbf24' : 'rgba(255,255,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36,
            touchAction: 'manipulation',
          }}
        >
          {starred ? <StarFilledIcon size={16} /> : <StarOutlineIcon size={16} />}
        </button>
      )}
    </>
  )
}

function SearchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function StarFilledIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fbbf24"
      stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function StarOutlineIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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
