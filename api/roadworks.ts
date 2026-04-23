// ─── GET /api/roadworks ───────────────────────────────────────────────────────
// Fetches Bulgaria's official DATEX II roadworks feed from datasheet.api.bg,
// parses the XML and returns normalized JSON.
//
// Feed URL: https://datasheet.api.bg/files/YYYYMMDD_roadworks_r01.xml
// File changes daily. Cached in Redis for 30 min to avoid hammering the source.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { XMLParser } from 'fast-xml-parser'
import { redis, isRedisConfigured } from './_lib/db/redis.js'

const CACHE_KEY = 'roadworks:bg:v1'
const CACHE_TTL = 30 * 60  // 30 min

export interface RoadworkRecord {
  id:        string
  lat:       number
  lng:       number
  descBg:    string   // Bulgarian description (most detailed)
  descEn:    string   // English description (may be empty)
  startTime: string | null
  endTime:   string | null
  severity:  string   // 'high' | 'medium' | 'low' | 'unknown'
}

// Build today's feed URL using Sofia local time (UTC+2 winter / UTC+3 summer)
function buildUrl(): string {
  // Add 2 h to UTC as conservative offset — good enough for date selection
  const sofia = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const y = sofia.getUTCFullYear()
  const m = String(sofia.getUTCMonth() + 1).padStart(2, '0')
  const d = String(sofia.getUTCDate()).padStart(2, '0')
  return `https://datasheet.api.bg/files/${y}${m}${d}_roadworks_r01.xml`
}

// ── XML parsing ───────────────────────────────────────────────────────────────

type AnyObj = Record<string, unknown>

function str(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'object' && '#text' in (v as AnyObj)) return String((v as AnyObj)['#text'] ?? '')
  return String(v)
}

function extractLangValues(values: unknown, lang: string): string {
  if (!values || typeof values !== 'object') return ''
  const arr = (values as AnyObj)['value']
  if (!arr) return ''
  const items = Array.isArray(arr) ? arr : [arr]
  return items
    .filter((v) => typeof v === 'object' && (v as AnyObj)['@_lang'] === lang)
    .map((v) => str((v as AnyObj)['#text'] ?? v))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseXml(xml: string): RoadworkRecord[] {
  const parser = new XMLParser({
    ignoreAttributes:    false,
    attributeNamePrefix: '@_',
    // Ensure these are always arrays even when only one element exists
    isArray: (name) => ['situation', 'pointByCoordinates', 'value', 'comment'].includes(name),
    // Preserve text content alongside attributes
    textNodeName: '#text',
  })

  const doc = parser.parse(xml) as AnyObj
  const payload = ((doc['d2LogicalModel'] as AnyObj)?.['payloadPublication'] as AnyObj) ?? {}
  const situations = (payload['situation'] as AnyObj[]) ?? []

  const results: RoadworkRecord[] = []

  for (const sit of situations) {
    const rec  = sit['situationRecord'] as AnyObj | undefined
    if (!rec) continue

    // Coordinates — first point of groupOfLocations
    const locs = rec['groupOfLocations'] as AnyObj | undefined
    const pts  = locs?.['pointByCoordinates']
    const ptsArr = Array.isArray(pts) ? pts : (pts ? [pts] : [])
    const firstPt = (ptsArr[0] as AnyObj | undefined)?.['pointCoordinates'] as AnyObj | undefined
    if (!firstPt) continue

    const lat = Number(firstPt['latitude'])
    const lng = Number(firstPt['longitude'])
    if (!isFinite(lat) || !isFinite(lng)) continue

    // Dates
    const vts = ((rec['validity'] as AnyObj)?.['validityTimeSpecification'] as AnyObj) ?? {}
    const startTime = str(vts['overallStartTime']) || null
    const endTime   = str(vts['overallEndTime'])   || null

    // Descriptions — generalPublicComment.comment[0].values.value[]
    const gpc      = rec['generalPublicComment'] as AnyObj | undefined
    const comments = gpc?.['comment']
    const firstComment = Array.isArray(comments) ? comments[0] : comments
    const values   = (firstComment as AnyObj | undefined)?.['values']
    const descBg   = extractLangValues(values, 'bg')
    const descEn   = extractLangValues(values, 'en')

    results.push({
      id:        String(sit['@_id'] ?? `rw-${results.length}`),
      lat,
      lng,
      descBg,
      descEn,
      startTime,
      endTime,
      severity:  str(sit['overallSeverity']) || 'unknown',
    })
  }

  return results
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=300')

  // Redis cache
  if (isRedisConfigured()) {
    const cached = await redis.get<RoadworkRecord[]>(CACHE_KEY)
    if (cached) {
      res.status(200).json({ roadworks: cached, source: 'cache' })
      return
    }
  }

  const url = buildUrl()
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'TesRadar/1.0 (tesradar.tech)' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!r.ok) {
      // Feed might not exist yet today — return empty rather than error
      console.warn(`[ROADWORKS] Feed returned ${r.status} for ${url}`)
      res.status(200).json({ roadworks: [], source: 'empty', hint: `Feed ${r.status} at ${url}` })
      return
    }

    const xml  = await r.text()
    const data = parseXml(xml)

    if (isRedisConfigured() && data.length > 0) {
      await redis.setWithExpiry(CACHE_KEY, data, CACHE_TTL)
    }

    console.log(`[ROADWORKS] Loaded ${data.length} records from ${url}`)
    res.status(200).json({ roadworks: data, source: 'live', url })
  } catch (err) {
    console.error('[ROADWORKS] Fetch/parse error:', String(err))
    res.status(502).json({ error: String(err), url })
  }
}
