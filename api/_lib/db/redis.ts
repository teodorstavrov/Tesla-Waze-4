// ─── Upstash Redis REST client ─────────────────────────────────────────
//
// Minimal client using only the Upstash HTTP REST API — no SDK.
// All values are JSON-serialized before storing and deserialized on read.
//
// Required env vars:
//   UPSTASH_REDIS_REST_URL   — e.g. https://eu1-xxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN — REST token from Upstash console

const _url   = process.env['UPSTASH_REDIS_REST_URL']
const _token = process.env['UPSTASH_REDIS_REST_TOKEN']

export function isRedisConfigured(): boolean {
  return Boolean(_url && _token)
}

async function _cmd(command: (string | number)[]): Promise<unknown> {
  if (!_url || !_token) throw new Error('Redis not configured (UPSTASH_REDIS_REST_URL / TOKEN missing)')

  const res = await fetch(_url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })

  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`)

  const data = await res.json() as { result: unknown; error?: string }
  if (data.error) throw new Error(`Redis: ${data.error}`)
  return data.result
}

export const redis = {
  isConfigured: isRedisConfigured,

  async get<T>(key: string): Promise<T | null> {
    const raw = await _cmd(['GET', key]) as string | null
    return raw ? (JSON.parse(raw) as T) : null
  },

  async set(key: string, value: unknown): Promise<void> {
    await _cmd(['SET', key, JSON.stringify(value)])
  },

  async setWithExpiry(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await _cmd(['SET', key, JSON.stringify(value), 'EX', ttlSeconds])
  },

  async del(key: string): Promise<void> {
    await _cmd(['DEL', key])
  },

  /** Atomic increment. Returns the value after increment. */
  async incr(key: string): Promise<number> {
    return (await _cmd(['INCR', key])) as number
  },

  /** Set TTL on an existing key (seconds). */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await _cmd(['EXPIRE', key, ttlSeconds])
  },

  /** Send multiple commands in one HTTP request (Upstash pipeline).
   *  Returns results in the same order as commands. */
  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    if (!_url || !_token) throw new Error('Redis not configured')
    const res = await fetch(`${_url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
    })
    if (!res.ok) throw new Error(`Redis pipeline HTTP ${res.status}`)
    const data = await res.json() as { result: unknown; error?: string }[]
    return data.map((d) => {
      if (d.error) throw new Error(`Redis pipeline: ${d.error}`)
      return d.result
    })
  },
}
