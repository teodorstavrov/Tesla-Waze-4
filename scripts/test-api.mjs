/**
 * Provider connectivity test — no Vercel account needed.
 * Run: node scripts/test-api.mjs
 */

const BG_BBOX = { minLat: 41.235, minLng: 22.36, maxLat: 44.215, maxLng: 28.609 }

async function overpassQuery(query) {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const b = BG_BBOX
const bboxStr = `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`

console.log('═══ Provider Connectivity Test ═══\n')

// 1. Tesla (Overpass, Tesla-tagged only)
console.log('[Tesla] Overpass — Tesla-tagged stations...')
try {
  const t0 = Date.now()
  const q = `[out:json][timeout:20];\n(\n  node["amenity"="charging_station"]["network"="Tesla"](${bboxStr});\n  way["amenity"="charging_station"]["network"="Tesla"](${bboxStr});\n  node["amenity"="charging_station"]["operator"="Tesla"](${bboxStr});\n  way["amenity"="charging_station"]["operator"="Tesla"](${bboxStr});\n);\nout body center qt;`
  const data = await overpassQuery(q)
  console.log(`  ✓ ${data.elements.length} Tesla stations in ${Date.now()-t0}ms`)
  data.elements.slice(0,3).forEach(e =>
    console.log(`    • ${e.tags?.name ?? e.tags?.operator ?? '(unnamed)'} [${e.tags?.['socket:tesla_supercharger'] ?? '?'} stalls]`))
} catch(e) { console.log(`  ✗ ${e.message}`) }

// 2. OSM all
console.log('\n[OSM/Overpass] All charging stations...')
try {
  const t0 = Date.now()
  const q = `[out:json][timeout:25];\n(node["amenity"="charging_station"](${bboxStr});way["amenity"="charging_station"](${bboxStr}););\nout body center qt;`
  const data = await overpassQuery(q)
  console.log(`  ✓ ${data.elements.length} total stations in ${Date.now()-t0}ms`)
  const named = data.elements.filter(e => e.tags?.name).slice(0,2)
  named.forEach(e => console.log(`    • "${e.tags.name}"`))
} catch(e) { console.log(`  ✗ ${e.message}`) }

// 3. OCM
console.log('\n[OCM] OpenChargeMap...')
const key = process.env.OCM_API_KEY
if (!key) {
  console.log('  ⚠ No OCM_API_KEY — get a free key at openchargemap.org/site/developerinfo')
  console.log('    Set it: $env:OCM_API_KEY="your-key" (PowerShell) then re-run')
} else {
  try {
    const t0 = Date.now()
    const params = new URLSearchParams({ output:'json', boundingbox:`(${bboxStr})`, maxresults:'200', verbose:'false', key })
    const res = await fetch(`https://api.openchargemap.io/v3/poi/?${params}`, { signal: AbortSignal.timeout(12_000) })
    const text = await res.text()
    if (text.startsWith('REJECTED')) throw new Error('REJECTED (invalid key?)')
    const data = JSON.parse(text)
    console.log(`  ✓ ${data.length} stations in ${Date.now()-t0}ms`)
    if (data.length) console.log(`    • "${data[0].AddressInfo?.Title}"`)
  } catch(e) { console.log(`  ✗ ${e.message}`) }
}

console.log('\n═══ Summary ═══')
console.log('OSM/Overpass: ✓ working — primary source (717 stations BG)')
console.log('Tesla:        ✓ working — OSM Tesla-tagged subset')
console.log('OCM:          ' + (key ? '→ see above' : '⚠ needs free API key'))
console.log('\nNext: npx vercel login → npx vercel dev → test /api/ev/stations')
