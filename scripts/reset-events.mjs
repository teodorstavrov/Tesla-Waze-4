// Reset all event counters (confirms/denies → 0) via Upstash Redis REST API.
// Usage: node scripts/reset-events.mjs
//
// Requires env vars (same as Vercel):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const url   = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY   = 'teslaradar:events:v1'

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
  console.log('No events found in Redis — nothing to reset.')
  process.exit(0)
}

const events = JSON.parse(raw)
console.log(`Found ${events.length} events. Resetting confirms/denies to 0…`)

const reset = events.map(e => ({ ...e, confirms: 0, denies: 0 }))
await redisCmd(['SET', KEY, JSON.stringify(reset)])

console.log(`Done. ${reset.length} events reset.`)
