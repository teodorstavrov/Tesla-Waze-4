# TesRadar Changelog

All notable changes to TesRadar, organized by date (newest first).

---

## 2026-10-31
- **Feat: премахване на Норвегия изцяло** — изтрити всички следи от Norway: country config (NO от CountryCode, COUNTRIES, COUNTRY_LIST), NorwayBetaBanner компонент, норвежки locale блок от i18n (~280 реда), sections_no.ts (10 ATK секции), NORWAY_BBOX, 17 NO lat-band региони от sync-cameras, NO от sync-stations, Norway от ai-ask knowledge base, всички no: езикови записи (TTS, route, alerts), SEO (title, meta, keywords, hreflang, JSON-LD, FAQ) — commit `25b6b44`

## 2026-10-30
- **Feat: автоматичен нощен/дневен режим по GPS и залез/изгрев** — заменен фиксираният праг 07:00–19:00 с NOAA алгоритъм за изчисляване на реален изгрев/залез по GPS координати и часова зона на устройството; фолбек към фиксирани часове докато GPS не е активен; интервалът за проверка намален от 1 час на 1 минута за бързо превключване
- **Feat: авто-центриране след ръчно местене на картата** — 5 секунди след последното докосване картата автоматично се върща към GPS позицията (само ако е активна навигация); нов `touchstart` анулира таймера при ново докосване
- **Feat: Leipzig + Dresden добавени към police sync Германия** — 7 → 9 града; двата града са в A9/A14 и A4 коридорите в Саксония

## 2026-10-29b
- **Feat: всички двигатели +15% maxRpm** — вдигнати горните обороти на Sport V8 (до 5980), Muscle V8 (до 5405), AMG S63 (до 7130), Bentley W12 (до 6785); idle RPM непроменени
- **Feat: voice VAD noise rejection + 3s silence auto-stop** — честотен анализ само в speech band (300–4000 Hz); 3 consecutive frames (~240ms) за потвърждение на реч преди да се брои за активна команда; silence timeout вдигнат на 3s; по-висок SILENCE_THRESHOLD (14 Tesla / 18 desktop)

## 2026-10-29
- **Fix: fines (Finland) station markers yellow** — changed `source === 'fines'` color from `#0ea5e9` (blue) to `#FACC15` (yellow), letter F remains

## 2026-10-24b
- **Fix: map drag and pinch zoom work in Tesla browser (v2)** — the previous fix waited for MapLibre's `dragstart` event to cancel the rAF, but `dragstart` fires only AFTER the gesture threshold is crossed; during the recognition window (touchstart → first threshold-crossing touchmove), the rAF fires `jumpTo()` every ~16ms, each call invokes `stop()` internally which kills `DragPanHandler`/`TouchZoomRotateHandler` before the gesture is recognized — so `dragstart` never fired; new fix: listen to raw `touchstart` on the map container (capture phase) and cancel the rAF immediately when a finger touches the screen; resume on `touchend`/`touchcancel` only if `followStore.isFollowing()` is still true (a drag sets it false via the existing `dragstart` handler before `touchend` fires)

## 2026-10-24
- **Feat: 2 нови немски града в police sync** — добавени Stuttgart и Dortmund към `waze-police-sync/sync.mjs` (DE: 5 → 7 града)
- **UX: Norway/Sweden/Finland преместени в дъното на country picker** — нов ред: BG, NL, BE, DE, NO, SE, FI

## 2026-10-23
- **Fix: map drag and pinch zoom now work in Tesla browser** — `map.jumpTo()` (called 60fps by the dead-reckoning rAF loop) internally calls `stop()`, which under certain conditions calls `handlers.stop()` — killing any active drag or pinch-zoom gesture handler; fix: (1) added `if (map.isMoving()) { reschedule; return }` guard inside the rAF frame — skips `jumpTo` entirely while a user gesture is active; (2) added `dragstart` listener that immediately cancels the pending rAF via `cancelAnimationFrame` so no `stop()` fires after the user starts dragging; result: panning and pinch-to-zoom work without the rAF interfering

## 2026-10-20-b
- **Fix: zoom buttons now instant** — `zoomIn(1)` / `zoomOut(1)` replaced with `zoomIn({duration:0})` / `zoomOut({duration:0})`; the dead-reckoning rAF loop calls `map.jumpTo()` every ~16ms which internally calls `stop()`, cancelling any running zoom animation after only ~0.05 units of progress; instant zoom applies the full ±1 step atomically before the next rAF frame

## 2026-10-20
- **Feat: Dead-reckoning smooth navigation — 60fps map movement** — replaced the 1Hz `easeTo(duration:0)` GPS-tick approach (which caused 1-second visible jumps) with a `requestAnimationFrame` dead-reckoning loop; architecture: GPS callback now only updates module-level state (`_drLat`, `_drLng`, `_drHeading`, `_drSpeedMs`, `_drTs`, `_drBearPrev`, `_drBearTs`); a rAF loop runs at native display framerate and calls `map.jumpTo()` every ~16ms with position predicted from `speed × elapsed_time × cos/sin(heading)`; `map.jumpTo()` does not fire `dragstart` so the follow-mode guard (`beginProgrammaticMove`) is no longer needed; bearing interpolation (`lerpBearing`, 300ms blend) eliminates heading snaps at GPS tick boundaries; mode-switch transitions: course-up → north-up uses `easeTo(450ms)` then resumes rAF; north-up → course-up interpolates from current bearing (0°) to course heading over 450ms; follow re-enable immediately resumes rAF from last dead-reckoned state; result: map pans and rotates with butter-smooth 60fps motion during navigation with no sharp cuts

## 2026-10-19
- **Style: GPS avatar reskinned — Tesla red mirror-chrome** — arrow recoloured to match the "Докладвай" button (`#e31937`); mirror/metallic 3D effect achieved with a 6-stop alternating gradient (near-white at tip → bright red → Tesla red → lighter "horizon reflection" band → dark shadow → very dark base), a diagonal gloss overlay (upper-left light source shine fading to transparent), a bright white hot-spot specular at the very tip, a dark-red 3D extrusion depth polygon (shifted +1.5px right/down), and a red-tinted drop shadow; ambient ring updated to red
- **Feat: "Картата се върти" (course-up / rotating-map) navigation re-implemented from scratch** — complete rebuild after the October 18 removal; architecture: (1) `src/lib/bearingUtils.ts` — pure math module (`normalizeBearing`, `bearingDiff`, `lerpBearing`, `courseUpMapBearing`), zero DOM/MapLibre dependencies, covered by 22 unit tests; (2) `settingsStore` — added `HeadingMode = 'north-up' | 'course-up'` type, `headingMode` field (default `'north-up'`), `setHeadingMode()` method, persisted in localStorage; (3) i18n — added `controls.courseUp` / `controls.northUp` keys to all 7 language blocks (BG: "Картата се върти" / "Аватара се върти"); (4) `HeadingAvatar` — `positionElement` now takes `(el, map, courseUp)` and uses map container dimensions; in course-up avatar sits at 70% from top (matching camera padding); arrow locked at 0° in course-up (map rotates instead), rotates to navBearing in north-up; subscribes to settingsStore; (5) `MapShell` GPS callback — in course-up calls `courseUpMapBearing(navBearing)` (MapLibre bearing = navBearing since "bearing = compass direction that is up"), applies `padding.top = 0.4 × containerH`, `duration = 0` (required — animation lag causes lateral drift), suppresses near-zero bearing changes via `rotationThresholdDeg`; reverts map bearing to 0 and clears padding when switching back to north-up; (6) `LeftControls` — heading mode toggle button added after vehicle profile, showing `NorthUpIcon` (compass needle) or `CourseUpIcon` (rotating arrows), title/aria uses i18n labels
- **Fix: TripSummaryBanner navigation panel moved right on Tesla** — was overlapping the CarClock (left edge ~100px ≈ 8%); moved from `left: '19%'` to `left: '25%'` on Tesla browser, now centered between clock right edge and engine simulator button center
- **Fix: AI voice assistant Cancel button stops immediately** — pressing Cancel in any phase (listening, recording, processing) now instantly closes the overlay; root causes fixed: (1) `recorder.onstop` fired asynchronously after `dismiss()` and overrode the idle state with `processing` — fixed with `cancelledRef` guard at top of `onstop`; (2) in-flight STT (`/api/stt`) and AI (`/api/ai-ask`) fetches continued executing after Cancel — fixed by wiring `fetchAbortRef` (an `AbortController`) through both fetches and calling `.abort()` in `dismiss()`; (3) no Cancel button was shown during the `processing` phase — added; both fetch catch blocks also check `cancelledRef.current` before showing error UI so an aborted fetch never flashes an error

## 2026-10-18
- **Fix: Cyrillic text corrupted** — PowerShell `Set-Content -Encoding utf8` writes UTF-8 with BOM (EF BB BF), breaking all Cyrillic characters in the app; restored `i18n.ts` from git and re-applied the heading-mode key deletions using `grep -v` (no BOM)
- **Fix: "t is not defined" crash** — `t` was accidentally removed from the LeftControls import during the course-up cleanup; two remaining `t('controls.vehicleProfile')` calls caused a runtime crash on load
- **Removed "Картата се върти" (course-up) mode** — only north-up remains: avatar arrow rotates to show direction of travel, map stays north-aligned; removed heading toggle button from LeftControls, removed `HeadingMode` type and `setHeadingMode` from settingsStore, removed all course-up bearing/padding logic from MapShell GPS callback, removed courseUp/northUp/courseUpHint/northUpHint/orientLabel keys from all 7 i18n language blocks (35 lines), removed `heading_course_up` / `heading_north_up` voice commands from VoiceAssistant, removed forward-projection code from HeadingAvatar (was only needed for course-up)

## 2026-10-17
- **Course-up forward-only movement — horizontal oscillation eliminated** — root cause: without an active route, raw GPS has ±5m lateral noise relative to the road; in course-up mode the road points "up" so perpendicular noise appears as left/right map oscillation at 1Hz; fix: project GPS displacement onto the current bearing direction — only the forward component advances the displayed position, lateral noise is discarded; 30m safety limit resets to raw GPS if the projection drifts too far from actual GPS position; route snap (when navigating) already provided this guarantee for the route case
- **Avatar stays at GPS location during map pan/zoom** — when the user manually pans or zooms the map (follow mode OFF), the avatar now stays pinned to the actual GPS geographic location on screen; implemented via `map.on('render', updateAvatarPosition)` which calls `map.project([lng, lat])` on every render frame when follow is OFF, and `positionElement()` (fixed padded center) when follow is ON; also subscribes to `followStore` changes so the avatar repositions immediately when follow mode toggles
- **Course-up map rotation fix — diagonal road eliminated** — root cause: raw GPS heading EMA alpha=0.2 required 10+ GPS ticks (≈10 s) to converge after a turn when no route snap; map bearing lagged by 70°+ making road appear strongly diagonal; fix: alpha raised to 0.8 (converges within 2 ticks). Also reverted incorrect commit 5d84a43 which set arrowDeg=(360-navBearing)%360 (geographic north compass); correct behavior is arrowDeg=0 (screen-up = direction of travel) while MapShell rotates the map to align the road
- **Avatar geographic-north orientation + low-speed bearing fix** — two further course-up improvements: (1) avatar arrow in course-up now always points geographic north: `arrowDeg = (360 − navBearing) % 360` counter-rotates the HTML overlay by the same angle MapShell rotates the map, keeping the arrow tip stationary on the geographic north direction while the road rotates beneath; (2) MapShell `PAN_MIN_M` filter (`< 3 m → skip`) was also skipping bearing updates in course-up — at city speeds (< 10 km/h) virtually every GPS tick was skipped, freezing the map mid-turn and causing the road to appear sideways; fix: added `_lastBearing` tracking and in course-up bypass the skip when bearing delta ≥ 1.5°
- **Course-up lateral drift fix — root cause eliminated** — two simultaneous bugs caused avatar to appear sideways: (1) EMA smoothing on snap bearing lagged 2-3 ticks at each segment change, causing the map to rotate to the wrong angle; fixed by using exact snap bearing instantly (EMA kept only for raw GPS heading fallback); (2) `easeTo(duration=500)` in course-up let bearing and position animate over 500ms while next GPS tick arrived with a new bearing mid-animation; fixed by `duration=0` for all course-up panning; (3) added route progress tracking in snap — searches only from (currentSegIdx-3) forward so snap never jumps back to already-passed segments

## 2026-10-16
- **Voice report confirmation + auto-close** — when a road event is reported via voice assistant through the Докладвай button, the report modal now briefly shows a ✅ green confirmation card with the AI's confirmation text for 2 seconds, then automatically closes the panel; previously the modal closed silently with no feedback
- **Course-up mode complete rewrite** — replaced hard anti-jitter cutoff with EMA bearing smoothing (lerpBearing, alpha=0.5 for snap / 0.25 for GPS); added direction-guard to snapToRoute: if nearest segment bearing is >90° off from current heading (U-turn return leg), it is flipped 180° to always match direction of travel; eliminates avatar pointing outside road and moving backwards on any street type
- **Avatar fixed-position overlay (pre-MapLibre behavior restored)** — rewrote HeadingAvatar to use a `position:absolute` div appended to the map container instead of a MapLibre Marker; avatar stays at a fixed CSS screen position (`cx = w/2`, `cy = h/2 + topPad/2`) while the map pans underneath; eliminates all GPS drift/coordinate-projection errors permanently; restored original arrow SVG (tip at `(14,3)`, circle `r=13`, full 76px size — was incorrectly shrunk in a prior commit); rotation formula unchanged (`courseUp ? 0 : bearing`); arrow always points north/forward, always centered on road
- **Course-up mode fix — no lateral drift** — map rotation uses smooth route-segment bearing (getNavBearing) instead of noisy raw GPS heading; map centering uses snapped road position (getNavPosition) so car never drifts sideways off the road in course-up mode; avatar arrow tip fixed at element center so rotation never displaces it laterally; heading mode toggle restored in LeftControls — redesigned avatar SVG so the sharp tip is exactly at the element center; CSS rotation always pivots around the tip, keeping it pinned on the snapped road position regardless of direction; exported `getNavBearing()` from HeadingAvatar so MapShell uses the route-segment bearing (smooth, jitter-free) instead of raw GPS heading for course-up map rotation — road and avatar are now aligned in course-up mode

## 2026-10-15
- **Fines Charging API integration** — added new EV station provider sourced from `https://public.finescharging.com/v1/locations.geojson`; Fines stations are Bulgaria-only and take highest priority in the BG merge; new `StationSource = 'fines'`; provider file `api/_lib/providers/fines.ts` (5-min cache, no auth); Fines markers shown in teal (`#0ea5e9`) with bold "F" identifier — the API has no logo/brand field so color+letter serves as branding; live availability polling is a frontend-side option via `/v1/live.json` (separate endpoint)
- **Докладвай → inline voice indicator** — report modal now shows a blue listening bar (🎤 + countdown 3→2→1) when voice is active; voice assistant panel is suppressed (hidden) — it runs silently in background; voice command auto-reports and closes modal; no speech in 3s → indicator disappears, modal stays for manual selection
 — pressing Докладвай now simultaneously opens the report modal AND starts the voice assistant in report-mode; it listens for 3 seconds — if a voice command is detected (e.g. „камера тук") it processes and auto-reports; if no speech in 3s it silently closes while the report modal stays open for manual input
- **BottomDock layout** — removed EV stations toggle button; new order: Sound engine (left) → Докладвай (center) → Route (right); Sound engine and Route buttons reduced 30% in size; volume panel now floats to the LEFT of the engine button
- **Voice assistant button label** — added small "AI ГЛАС" label under the mic icon in LeftControls so users know the button activates the voice assistant
- **Report button voice hint** — added second line hint inside the Докладвай button (e.g. _или кажи „камера тук"_) in all 7 languages, prompting users to report via voice assistant
- **Avatar road-snap + never-backwards heading** — avatar now snaps position to nearest route segment (within 60 m) so it never floats off the road; heading derived from route segment bearing (always forward) instead of noisy raw GPS; heading jumps >100° are suppressed so avatar never appears to drive in reverse; course-up mode unchanged (arrow always 0°, map rotates)


- **RouteLayer v6 — canvas overlay (bypass MapLibre GeoJSON pipeline)** — after 5 failed attempts using `addSource`/`addLayer` with MapLibre's GeoJSON vector layer system, switched to a plain `<canvas>` element positioned over the map container; route is drawn with the Canvas 2D API using `map.project([lng,lat])` for coordinate conversion and `map.on('render', redraw)` to stay in sync with pan/zoom/rotate; primary route is solid blue `#2B7FFF` (7px with glow), alt routes are dashed semi-transparent; completely bypasses MapLibre's Web Worker / WebGL shader pipeline that appears non-functional on Tesla browser

## 2026-10-14
- **RouteLayer v4b — route line fix (isStyleLoaded gate removed)** — `isStyleLoaded()` in MapLibre checks raster tile cache, not just style spec; was returning false while tiles loaded → `draw()` exited early forever. Fix: remove the check entirely; `addSource`/`addLayer` succeed right after `style.load` fires regardless of tile loading state
- **RouteLayer v4 — route line fix (rAF fallback)** — React children effects run before parent's; MapShell sets `mapInstance` in its own `useEffect`, so `getMap()` was null when RouteLayer's effect ran first; v1–v3 all returned immediately with no listeners set up. Fix: `requestAnimationFrame` defers `init()` to after MapShell's effect fires (same pattern as SectionLayer)
- **Remove "Зареди по пътя" (EV stations along route)** — removed the expandable EV charging stations section from RoutePanel; also cleaned up related state, imports, `StationRow`, `ChevronIcon`, and `useMemo` usage; Hide button remains always visible
- **Migration regression fixes** — replaced 4 leftover `map.setView()` (Leaflet-only API) calls with MapLibre equivalents (`map.easeTo` / `map.jumpTo`); also fixed coordinate order (`[lat,lng]`→`[lng,lat]`) in CountryPicker country-center branch; affected features: CountryPicker confirm, SearchBar EV station select, MeetupList "go to map", VoiceAssistant "center" command
- **Avatar size +15%** — increased GPS avatar from 66px to 76px for better visibility on Tesla touchscreen
- **Avatar heading fix (course-up mode)** — in "map rotates" mode the avatar arrow now always points toward the top of the screen (= direction of travel); fix: read `settingsStore.headingMode` directly instead of `map.getBearing()` (animated bearing gave wrong values mid-animation)
- **Avatar z-index fix** — GPS avatar marker now always renders above all other map markers (camera, section, event) via explicit `z-index:10` on the marker element
- **RouteLayer rewrite v3** — unconditional cleanup via bare `try{removeLayer}catch{}` (no getLayer guards), persistent `map.on('style.load',draw)` listener instead of `once`, draw() is idempotent (cleanup→add fresh with real data); eliminates all "source already exists" cascade failures permanently
- **Route line fix** — rewrite RouteLayer.tsx with defensive guards (`getSource`/`getLayer` checks before add), try-catch for map operations, `setData()` for in-place updates, proper click-handler cleanup via clicksRef, and `triggerRepaint()` after draw; also upgraded GeoJSON payload to FeatureCollection for better MapLibre compatibility
- **AI rate limit UX fix** — when all Groq models fail with 429 (org-level rate limit), return HTTP 429 with a user-friendly localized message instead of the raw "All models failed" error string; message is returned in the session language (bg/no/sv/fi/nl/de/en)
- **MapLibre GL JS migration** — complete rewrite of all map rendering from Leaflet to MapLibre GL JS (WebGL)
  - `MapShell.tsx`: new MapLibre map init, course-up via `easeTo({bearing})`, perspective pan via `setPadding`, tile switching via `setTiles()`, traffic layer toggle
  - `HeadingAvatar.tsx`, `EventMarkerLayer.tsx`, `MeetupLayer.tsx`, `SavedPlacesLayer.tsx`, `CameraMarkerLayer.tsx`, `EvMarkerLayer.tsx`: all markers migrated to `maplibregl.Marker({element})`
  - `SectionLayer.tsx`, `RouteLayer.tsx`, `RoadworksLayer.tsx`, `CountryBoundsLayer.tsx`: all polylines/rectangles migrated to GeoJSON sources + line layers
  - `LocationButton.tsx`: `setView` → `easeTo({center:[lng,lat]})` (MapLibre coordinate order)
  - `ZoomControls.tsx`: `zoomIn(1)` → `zoomIn()` (MapLibre API)
  - `globals.css`: Leaflet CSS → MapLibre GL CSS, all popup/map class names updated
  - Admin map (`AdminApp.tsx`) intentionally stays on Leaflet (not Tesla-facing)
  - Build: 0 TypeScript errors, 0 build errors

## 2026-10-13
- Added 2026 vehicle configs: Model 3 Performance (2026), Model Y Long Range RWD + Performance (2026)
- Repositioned TripSummaryBanner on Tesla browser — no longer overlaps EV filter button (left: 19%)

## 2026-10-12
- Voice assistant: semantic road event reporting in all platform languages ("полиция тук", "инцидент тук", "камера тук", "опасност тук", etc.)
- Voice assistant: GPS pre-capture at activation moment — marker placed at actual location before command processing
- Voice assistant: set home/work via voice ("дом тук", "работа тук")
- Engine simulator OFF button moved to overlay badge (top-right corner of main engine button)
- EV filter bar disabled by default for new users (was enabled)

## 2026-10-03
- Engine simulator: added TEST button (bypasses GPS requirement for testing sounds)
- Germany added to DE sync group
- Navigation panel and UI fixes

## 2026-09-22
- Navigation auto-zooms +3 levels on route start
- Engine simulator OFF button added (standalone below engine button)
- Speed sections auto-close on exit
- Speed HUD dark mode support
- Navigation popup resize improvements

## 2026-09-20
- Complete rebranding: WazeSync → TeslaNavSync (scheduled tasks, scripts, logs)
- All sync groups migrated to teslanav.com API — Waze dependency fully removed
- 4-quadrant tile scanning for cities, NL, BE (reduces pacing 3x)
- Route group bypass for WazeGuard (teslanav.com is independent)
- Fix: don't alert on 0 police — only alert when all requests fail
- Fix: locale-safe epoch ms calculation (DateTimeOffset)
- Fix: warm-up to first tile coords instead of hardcoded Sofia for BE/NL

## 2026-09-18
- Reverted MapTiler tiles → back to OSM (MapTiler requires API key)
- Added MapTiler API key validation (rejects short/placeholder keys before use)

## 2026-09-12
- Meetup toast notification size reduced 40% (padding/font/radius scaled down)
- Fix: search history star button visible — 36px touch target with border
- Voice assistant: open/close Support and Rating panels by voice
- Vehicle profile panel made 15% smaller
- AI language auto-detection improvements

## 2026-09-10
- Smooth course-up rotation improvements
- Avatar rendering fix
- AI assistant: unique user stats tracking added

## 2026-09-08
- MapTiler dark + bright Voyager tiles (later reverted due to API key requirement)
- Voice log history page added
- Smoother course-up rotation

## 2026-09-07
- Fix: EV stations hidden when filtersBarEnabled=false in localStorage
- Reverted Carto tiles → OSM (Carto now requires API key)
- Voice mic gain fix
- Route panel 15% smaller; dismiss pill always visible

## 2026-09-06
- Fix: VAD now uses AnalyserNode on Tesla — removed broken chunk-size VAD that stopped recording after 2s
- Skip Groq "allam" model + trim system prompt examples to reduce token count
- Route panel: bottom-left position + compact pills
- Tesla 2026.26 firmware: multi-signal viewport compatibility mode (no UA dependency)
- Speed section card 25% smaller + compact route panel
- Engine button moved to right side of bottom dock
- AI assistant: history/stats + bidirectional voice commands (voice can open all panels)
- Route panel: wider (460px), above bottom dock (bottom:90), clears left controls

## 2026-09-04
- Fix: Tesla VAD uses chunk-size (prevents radio from auto-playing on voice activate)
- Route panel on Tesla: same size as desktop Chrome (maxHeight scroll guard only)

## 2026-09-03
- Improved Whisper STT accuracy on Tesla browser
- VAD: MIN_RECORD_MS 700→3000ms, SILENCE_MS 1600→2200ms, lower blob threshold
- Voice transcript now visible in answer phase (command shown in spoken language)
- Removed stale whisperLang reference

## 2026-09-02
- Fix: Groq 429 per-model rate limit → skip to next model (not fatal stop)
- Fix: skip groq/compound model on 413 Too Large

## 2026-09-01
- Engine sounds initial implementation (V8, hybrid audio engines)
- AI voice STT (Speech-to-Text via MediaRecorder + Groq Whisper)
- Camera sync improvements
- Visitor map
- Route fixes
- Admin panel improvements

## 2026-08-28
- AI: full site knowledge base, all controls, meetup/charger navigation
- AI sees full vehicle profile (model/year/trim/efficiency/Tesla connection/charging state)
- Speed section: 50m deviation abort, manual dismiss, double-beep exit sound
- Strengthened language detection: always respond in question's language
- AI model fallback chain + qwen model skip + daily voice usage limit

## 2026-08-27
- AI voice assistant: full settings control + rich vehicle context
- AI dynamically queries Groq /models endpoint and picks first available model
- Auto-skip decommissioned (400/404) and too-large (413) Groq models
- Updated Groq model: llama-3.1-8b-instant → llama-3.3-70b-versatile
- 25s AbortController timeout + safe buildContext()
- STT: reliable base64 via FileReader + native FormData for Groq Whisper
- Auto-fallback: SpeechRecognition network error → MediaRecorder + Groq Whisper
- Microphone access root-cause fix + full voice architecture

## 2026-08-26
- **TesRadar AI voice assistant** launched (Groq free tier, llama-3.1-8b-instant)
- Comprehensive responsive layout fixes (avatar, menus, panels, banners)
- Fluid UI with vh-based clamp() sizing throughout
- DEFAULT_ZOOM increased from 16 to 18
- Switched to OSM tiles (free, no API key required) + CSS dark mode filter
- Avatar positioned 20% below center in course-up mode

## 2026-08-25
- Fix: iOS Safari flex bug in onboarding scrollable div (minHeight:0)
- Fix: onboarding sticky footer button always visible on mobile

## 2026-08-18
- Fix: onboarding panels scrollable on mobile — button always reachable

## 2026-08-13
- Fix: camera sync bugs (wrong Redis key for single-region, Overpass silent timeout, increased fetch limits)

## 2026-08-10
- Added camera crons for SE/FI/NL/BE/DE + manual sync buttons
- Visitor country now derived from GPS coords (not selected app country)
- Fix: visitor dots on admin map (race condition + auto-refresh)
- Germany: visitor tracking, popup rotation, zoom+1

## 2026-08-09
- Germany (DE) added: cameras, charging stations, full German UI

## 2026-08-04
- Engine Pack Builder admin tool added
- Real Muscle Car V8 and Dodge Hellcat SRT 6.2L V8 engines (both later reverted due to sample quality)

## 2026-08-02
- W12 louder default volume + collapsible volume panel
- Engine volume slider added
- WazeGuard fixes + route sync 4h schedule

## 2026-07-26
- All new UI strings translated across all 6 languages
- 'Engine Simulator' toast shown on engine button press
- Speed limit sign removed from UI
- СЪБИТИЯ button fixed (now opens meetups list, not road events)
- Events list panel added; button renamed Събития → Маркери

## 2026-07-22
- Engine sound: split-rate rAF for smooth deceleration + fast acceleration response
- Lower RPMs, earlier gear shifts, smooth downshift landing

## 2026-07-21
- W12 Bentley synthesized engine sound added

## 2026-07-20
- Engine sound lag eliminated with rAF frequency interpolation
- AMG S63 V8 synthesized engine with exhaust pops on hard deceleration
- Real-audio engines made dynamic with hybrid synth+audio architecture
- Open Header V8 + S63 AMG real-audio engine sounds
- V8 Muscle 6L+ second engine sound with 3-state dock cycle
- **Live V8 engine sound simulation** driven by GPS speed (initial implementation)

## 2026-07-15
- Lock Sound modal translated to active language

## 2026-07-12
- Meetup notification banner moved below stats card (top-right)
- Section banner hides when leaving section; entry from end-camera side supported

## 2026-07-11
- City name shown in meetup upcoming notification banner
- Meetup notifications appear up to 2 days before event
- NL/BE camera sync crons paused
- Fix: avg-speed section entry detected regardless of where car is on section

## 2026-07-10
- Course-up (rotating map) set as default heading mode
- Per-section reverse-direction block replaces global exit cooldown
- Section exit panel shows for full 20s without override

## 2026-07-08
- Fix: avg-speed section always showed 0 speed (GPS timestamp unit bug)

## 2026-07-05
- Fix: bypass route cache on reroute + OSRM timeout added
- A2 Хемус reverse section added (Ignatiyevo→Devnya, westbound)
- ENTRY_M increased to 350m for reliable section detection
- Turn instruction HUD moved next to heading-toggle button

## 2026-07-03
- Belgium camera sync switched to lat bands (south/north) to fix merge conflicts
- **Tesla lock sound modal** with one-time email download links

## 2026-07-01
- Third Overpass mirror + User-Agent header for camera sync

## 2026-06-30
- BG_EN country option replaced with global EN language toggle button
- **Belgium** added as fully supported country (cameras, stations, sections)

## 2026-06-28
- TripSummaryBanner: initial implementation during active navigation
- TripSummaryBanner replaces SHOW pill after navigation starts
- Mobile layout fixes (RoutePanel full-width above BottomDock, TripSummaryBanner no clipping)

## 2026-06-25
- **Community meetup events** full feature set:
  - Attend/interest RSVP buttons with live counts
  - Recurring events + description field
  - Mutually exclusive RSVP (attend XOR interest)
  - Admin meetup editor (description, recurrence, RSVP stats)
  - Hide Edit button for non-creators
- Fix: count unique visitors instead of tabs in online counter
- Mobile UX refinements (gear button, filter bar, banner)

## 2026-06-14
- Rerouting and turn-instruction update reliability improvements
- Police first-alert threshold reduced from 700m to 500m

## 2026-06-08
- All remaining hardcoded Bulgarian strings replaced with t() translations
- Meetup deep links: shareable URL opens detail modal
- Meetup edit always visible + admin full edit access
- Meetup markers shown on admin map

## 2026-06-07
- Terms & Privacy modal
- Admin event editing directly on map
- Meetup detail: navigate button, follow only for non-owners
- Meetups in admin panel, email notifications, report-menu quick actions
- **Community events (meetups)** initial implementation

## 2026-06-06
- Closed-road icon + status labels for traffic/roadworks
- Fix: Tesla browser OOM crash prevention with large station counts

## 2026-06-05
- **Version bumped to v2.0**
- Police TTL reduced to 2h15m; alert only in direction of travel
- EV filter bar: separated bar-enabled vs expanded state
- EV filter bar show/hide toggle added
- Live Tesla battery shown in trip planning modal
- EV charging stations show/hide toggle in settings
- Onboarding updated (all 3 steps reflect current features, no Waze references)

## 2026-06-04
- Fix: precise city navigation + phonetic Bulgarian search
- Locations shown first in search results (charging stations second)
- Roadworks: full closed-section polyline drawn in red
- Fix: show 'ДОМ — Не е избран' when no home/work saved

## 2026-06-03
- Allow small/residential streets in routing and rerouting

## 2026-06-02
- Hide wazesync: internal descriptions from police marker UI
- Always preserve existing stations — never delete on provider failure
- Fix: fetchOSRMRoute undefined in reroute() + deviation threshold lowered to 50m

## 2026-05-31
- Fix: replaced all instances of teslaradar.tech with correct domain **tesradar.tech**

## 2026-05-28
- Redis: gzip-compress values to stay under Upstash 1 MB limit

## 2026-05-25
- Removed entire Waze police ingestion pipeline (no longer needed)
- Added server-side proxies for Overpass and Valhalla
- Resolved all TypeScript build errors

## 2026-05-23
- WazePoliceLayer map overlay consuming /api/police/live
- Production-grade police ingestion microservice via GitHub Actions + Neon + Upstash
- Multiple proxy/capture fixes for Playwright-based scraping

## 2026-05-21
- **Netherlands** fully supported: charging stations, cameras, 74 trajectcontrole sections, Dutch UI
- Country bounding-box overlay shown at low zoom levels
- Netherlands OCM split into west+east to cover Amsterdam/Rotterdam density

## 2026-05-20
- EV station comment button (email + admin map markers)
- User-submitted stations shown as orange markers on admin map

## 2026-05-15
- **User-submitted charging stations** with edit/delete own station + email approval flow
- 'Добави станция' (Add Station) button added to report modal

## 2026-05-14
- OCM pagination + Overpass timeout fix — recovered 1000+ missing Bulgarian stations

## 2026-05-11
- Speed sections: replaced exit banner with persistent bottom history bar

## 2026-05-10
- Via A2 Хемус toggle button in RoutePanel
- Settings panel, car clock, section HUD, Valhalla routing

## 2026-05-04
- Bulgarian avg-speed sections updated to official КАТ list (71 total)
- Section polylines draw along actual road geometry via OSRM
- All coordinates replaced with certified camera positions from official KML

## 2026-05-03
- Daily heal cron for EV stations (auto-retry when providers fail)
- EV pipeline: 100m dedup, price enrichment, sync safety guard, OCM retry

## 2026-05-01
- Roadworks: retry on error, persist visibility, fallback to yesterday's feed

## 2026-04-25
- Centralized performance profiles + AMD Lite mode

## 2026-04-23
- Bulgaria official road closures from datasheet.api.bg
- TomTom live traffic overlay with toggle button (moved to right controls)
- Redis: graceful in-memory fallback when Redis exhausted; daily commands reduced 5x

## 2026-04-20
- Tesla OAuth: split Bulgaria into BG (native) + English option
- Tesla: partner public key at well-known URL + partner region registration
- Tesla: auto-recover null vehicleIdentifier, store VIN, faster polling

## 2026-04-18
- **Tesla live battery** in stats card, tap-to-refresh, wake sleeping car
- Tesla server-side vehicle state cache (cache-first, cheap polling)
- Navigation: perspective camera mode (pan ahead on active route)
- Fix: false reroutes on highways (segment projection for deviation check)
- Google Analytics GA4 added

## 2026-04-17
- Route panel auto-minimizes on START
- Sweden and Finland added to station sync
- Solid police icon for better Tesla screen visibility

## 2026-04-13
- Never notify user about their own reported markers
- Blue background for turn instruction HUD
- Home/Work always visible in search + bigger star button

## 2026-04-12 — Rebrand
- **Rebranded: Tesla RADAR → TesRadar**
- Real-time online user counter (bottom-left)
- Streets/addresses search + favorites + Home & Work quick navigation
- Course-up (map rotates) as default heading mode
- Road speed limit sign next to rating star

## 2026-04-11
- **Sweden & Finland** added: cameras, avg-speed sections, country support
- Model S trims added for all eras (60/85/90/100 kWh)
- Production domain corrected to tesradar.tech everywhere
- Accident marker TTL reduced from 5 days to 3 hours
- Free map panning during navigation; recenter re-enables follow

## 2026-04-08
- **Norway** added: cameras, charging stations, avg-speed sections
- Camera sync: Redis-backed cache, Overpass tile splitting for large countries
- Admin: permanent markers, hide/show toggle, export/import JSON, stats by country/type/city
- Police TTL corrected to 2 hours

## 2026-03-27
- Larger controls, filter colors, more route options

## 2026-03-25
- Turn-by-turn navigation, offline cache, speed alerts, search history, tile crossfade
- EV stations along active route shown in RoutePanel
- Full Bulgarian UI
- Event voting, deny auto-delete, long-press reporting
- Clustering + power color coding

## 2026-03-23
- Station issue reporting + last updated timestamp
- Tesla UX polish
- PWA / offline tile caching
- Admin panel (initial version)

## 2026-03-22 — Initial Launch
- Map foundation (Leaflet, OSM tiles, course-up, GPS tracking)
- EV charging stations (OCM + Overpass, Redis cache, weekly cron sync)
- User-reported road events (police, accidents, cameras, hazards)
- Driving routes via OSRM + rerouting
- Proximity audio alerts
- Admin panel
- Bulgarian UI
