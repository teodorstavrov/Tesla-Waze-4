// ─── Upstash Redis REST client ─────────────────────────────────────────
//
// Minimal client using only the Upstash HTTP REST API — no SDK.
// All values are JSON-serialized + gzip-compressed before storing.
// Compressed values are prefixed with "gz:" for backward compatibility
// with any uncompressed values still in Redis.
//
// Required env vars:
//   UPSTASH_REDIS_REST_URL   — e.g. https://eu1-xxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN — REST token from Upstash console

import { gzipSync, gunzipSync } from 'zlib'

const _url   = process.env['UPSTASH_REDIS_REST_URL']
const _token = process.env['UPSTASH_REDIS_REST_TOKEN']

function compress(value: unknown): string {
  const json = JSON.stringify(value)
  return 'gz:' + gzipSync(Buffer.from(json, 'utf8')).toString('base64')
}

function decompress<T>(raw: string): T {
  if (raw.startsWith('gz:')) {
    const json = gunzipSync(Buffer.from(raw.slice(3), 'base64')).toString('utf8')
    return JSON.parse(json) as T
  }
  return JSON.parse(raw) as T
}

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
    return raw ? decompress<T>(raw) : null
  },

  async set(key: string, value: unknown): Promise<void> {
    await _cmd(['SET', key, compress(value)])
  },

  async setWithExpiry(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await _cmd(['SET', key, compress(value), 'EX', ttlSeconds])
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

  /** Set a single hash field (raw string, not compressed). */
  async hset(key: string, field: string, value: string): Promise<void> {
    await _cmd(['HSET', key, field, value])
  },

  /** Get all fields and values of a hash. Returns null if key is missing. */
  async hgetall(key: string): Promise<Record<string, string> | null> {
    const raw = await _cmd(['HGETALL', key])
    if (!raw) return null
    if (Array.isArray(raw)) {
      if (raw.length === 0) return null
      const result: Record<string, string> = {}
      for (let i = 0; i + 1 < raw.length; i += 2) {
        result[String(raw[i])] = String(raw[i + 1] ?? '')
      }
      return result
    }
    if (typeof raw === 'object') return raw as Record<string, string>
    return null
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
