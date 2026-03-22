// ─── Leaflet singleton ────────────────────────────────────────────────
// Single import point for Leaflet across the entire app.
// Prevents the duplicate-instance bug that breaks Leaflet in Vite.

import L from 'leaflet'

// Fix the broken default icon paths caused by Vite asset hashing
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

type IconDefaultWithGetUrl = L.Icon.Default & { _getIconUrl?: () => string }
delete (L.Icon.Default.prototype as IconDefaultWithGetUrl)._getIconUrl

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

export { L }
export default L
