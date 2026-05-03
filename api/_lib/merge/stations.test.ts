// ─── mergeStations unit tests ──────────────────────────────────────────────
//
// Run with: npm test
// Uses Node 18+ built-in test runner via tsx.

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { mergeStations } from './stations.js'
import type { NormalizedStation, ProviderResult } from '../normalize/types.js'

// 0.0005° lat ≈ 55 m  (within 100 m dedup threshold)
// 0.002°  lat ≈ 222 m (outside threshold)
const NEAR = 0.0005
const FAR  = 0.002

function makeStation(
  id: string,
  source: NormalizedStation['source'],
  lat: number,
  lng: number,
  extra: Partial<NormalizedStation> = {},
): NormalizedStation {
  return {
    id, source, externalId: id,
    name: 'Station', lat, lng,
    address: null, city: null, country: 'BG', network: null,
    totalPorts: 1, availablePorts: null, maxPowerKw: null,
    connectors: [], status: 'available',
    isFree: null, pricePerKwh: null, priceCurrency: null, pricingText: null,
    lastUpdated: null,
    ...extra,
  }
}

function providerResult(source: NormalizedStation['source'], stations: NormalizedStation[]): ProviderResult {
  return { source, stations, meta: { status: 'ok', count: stations.length, fetchMs: 0 } }
}

describe('mergeStations', () => {
  it('returns empty result when given no providers', () => {
    const { stations, deduplicated } = mergeStations([])
    assert.strictEqual(stations.length, 0)
    assert.strictEqual(deduplicated, 0)
  })

  it('passes through a single provider without deduplication', () => {
    const s = makeStation('tesla:1', 'tesla', 42.0, 23.0)
    const { stations, deduplicated } = mergeStations([providerResult('tesla', [s])])
    assert.strictEqual(stations.length, 1)
    assert.strictEqual(deduplicated, 0)
    assert.strictEqual(stations[0]!.id, 'tesla:1')
  })

  it('deduplicates two stations within 100m — higher-priority (tesla) wins', () => {
    const tesla = makeStation('tesla:1', 'tesla', 42.0,         23.0)
    const ocm   = makeStation('ocm:1',   'ocm',   42.0 + NEAR,  23.0)
    const { stations, deduplicated } = mergeStations([
      providerResult('tesla', [tesla]),
      providerResult('ocm',   [ocm]),
    ])
    assert.strictEqual(stations.length, 1)
    assert.strictEqual(deduplicated, 1)
    assert.strictEqual(stations[0]!.id,     'tesla:1')
    assert.strictEqual(stations[0]!.source, 'tesla')
  })

  it('keeps both stations that are more than 100m apart', () => {
    const a = makeStation('ocm:1', 'ocm', 42.0,        23.0)
    const b = makeStation('osm:1', 'osm', 42.0 + FAR,  23.0)
    const { stations, deduplicated } = mergeStations([
      providerResult('ocm', [a]),
      providerResult('osm', [b]),
    ])
    assert.strictEqual(stations.length, 2)
    assert.strictEqual(deduplicated, 0)
  })

  it('enriches winner pricePerKwh from lower-priority duplicate when winner has none', () => {
    const tesla = makeStation('tesla:1', 'tesla', 42.0,        23.0, { pricePerKwh: null, priceCurrency: null })
    const ocm   = makeStation('ocm:1',   'ocm',   42.0 + NEAR, 23.0, { pricePerKwh: 0.35, priceCurrency: 'BGN' })
    const { stations } = mergeStations([
      providerResult('tesla', [tesla]),
      providerResult('ocm',   [ocm]),
    ])
    assert.strictEqual(stations.length, 1)
    assert.strictEqual(stations[0]!.id,           'tesla:1')  // tesla still wins identity
    assert.strictEqual(stations[0]!.pricePerKwh,  0.35)
    assert.strictEqual(stations[0]!.priceCurrency, 'BGN')
  })

  it('does NOT overwrite winner pricePerKwh when winner already has one', () => {
    const tesla = makeStation('tesla:1', 'tesla', 42.0,        23.0, { pricePerKwh: 0.29, priceCurrency: 'EUR' })
    const ocm   = makeStation('ocm:1',   'ocm',   42.0 + NEAR, 23.0, { pricePerKwh: 0.35, priceCurrency: 'BGN' })
    const { stations } = mergeStations([
      providerResult('tesla', [tesla]),
      providerResult('ocm',   [ocm]),
    ])
    assert.strictEqual(stations[0]!.pricePerKwh,  0.29)
    assert.strictEqual(stations[0]!.priceCurrency, 'EUR')
  })

  it('enriches pricingText from duplicate when winner lacks it', () => {
    const tesla = makeStation('tesla:1', 'tesla', 42.0,        23.0, { pricingText: null })
    const osm   = makeStation('osm:1',   'osm',   42.0 + NEAR, 23.0, { pricingText: 'Pay at machine' })
    const { stations } = mergeStations([
      providerResult('tesla', [tesla]),
      providerResult('osm',   [osm]),
    ])
    assert.strictEqual(stations[0]!.pricingText, 'Pay at machine')
  })

  it('enriches isFree from duplicate when winner has null', () => {
    const ocm = makeStation('ocm:1', 'ocm', 42.0,        23.0, { isFree: null })
    const osm = makeStation('osm:1', 'osm', 42.0 + NEAR, 23.0, { isFree: true })
    const { stations } = mergeStations([
      providerResult('ocm', [ocm]),
      providerResult('osm', [osm]),
    ])
    assert.strictEqual(stations[0]!.isFree, true)
  })

  it('does NOT overwrite isFree when winner already has a value', () => {
    const ocm = makeStation('ocm:1', 'ocm', 42.0,        23.0, { isFree: false })
    const osm = makeStation('osm:1', 'osm', 42.0 + NEAR, 23.0, { isFree: true })
    const { stations } = mergeStations([
      providerResult('ocm', [ocm]),
      providerResult('osm', [osm]),
    ])
    assert.strictEqual(stations[0]!.isFree, false)
  })

  it('deduplicates three providers — tesla wins over both ocm and osm', () => {
    // All three within 100m of tesla: NEAR ≈ 55m lat, NEAR ≈ 41m lng
    const tesla = makeStation('tesla:1', 'tesla', 42.0,        23.0)
    const ocm   = makeStation('ocm:1',   'ocm',   42.0 + NEAR, 23.0)
    const osm   = makeStation('osm:1',   'osm',   42.0,        23.0 + NEAR)
    const { stations, deduplicated } = mergeStations([
      providerResult('tesla', [tesla]),
      providerResult('ocm',   [ocm]),
      providerResult('osm',   [osm]),
    ])
    assert.strictEqual(stations.length, 1)
    assert.strictEqual(deduplicated, 2)
    assert.strictEqual(stations[0]!.id, 'tesla:1')
  })

  it('handles mixed near/far stations correctly', () => {
    // s1 and s2 are near (dedup), s3 is far (kept)
    const s1 = makeStation('ocm:1', 'ocm', 42.0,        23.0)
    const s2 = makeStation('osm:1', 'osm', 42.0 + NEAR, 23.0)
    const s3 = makeStation('osm:2', 'osm', 42.0 + FAR,  23.0)
    const { stations, deduplicated } = mergeStations([
      providerResult('ocm', [s1]),
      providerResult('osm', [s2, s3]),
    ])
    assert.strictEqual(stations.length, 2)
    assert.strictEqual(deduplicated, 1)
  })
})
