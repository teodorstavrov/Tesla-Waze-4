// Update expiresAt for all existing events to match new TTL policy:
//   police  → now + 2 days
//   others  → now + 5 days
// Usage: node scripts/reset-expiry.mjs

const url   = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY   = 'teslaradar:events:v1'

const TWO_DAYS_MS  = 2 * 24 * 60 * 60 * 1000
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

if (!url || !token) {
  console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN')
  process.exit(1)
}

async function redisCmd(command) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(command),
  })
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`Redis: ${data.error}`)
  return data.result
}

const raw = await redisCmd(['GET', KEY])
if (!raw) {
  console.log('No events found in Redis — nothing to update.')
  process.exit(0)
}

const events = JSON.parse(raw)
const now = Date.now()

const updated = events.map(e => {
  const ttl = e.type === 'police' ? TWO_DAYS_MS : FIVE_DAYS_MS
  return { ...e, expiresAt: new Date(now + ttl).toISOString() }
})

await redisCmd(['SET', KEY, JSON.stringify(updated)])

const counts = updated.reduce((acc, e) => {
  acc[e.type] = (acc[e.type] ?? 0) + 1
  return acc
}, {})

console.log(`Updated ${updated.length} events:`, counts)
console.log('Police expire:', new Date(now + TWO_DAYS_MS).toISOString())
console.log('Others expire:', new Date(now + FIVE_DAYS_MS).toISOString())
