// ─── OCM provider unit tests ───────────────────────────────────────────────
//
// Tests for the pure parsing/normalization functions.
// Run with: npm test

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { parseUsageCost, simplifyConnectorType } from './ocm.js'

describe('parseUsageCost', () => {
  it('parses BGN per-kWh price', () => {
    const r = parseUsageCost('0.35 BGN/kWh')
    assert.strictEqual(r.pricePerKwh, 0.35)
    assert.strictEqual(r.priceCurrency, 'BGN')
  })

  it('parses Bulgarian Cyrillic лв/kWh', () => {
    const r = parseUsageCost('0,35 лв/kWh')
    assert.strictEqual(r.pricePerKwh, 0.35)
    assert.strictEqual(r.priceCurrency, 'BGN')
  })

  it('parses EUR amount with € symbol', () => {
    const r = parseUsageCost('0.49€/kWh')
    assert.strictEqual(r.pricePerKwh, 0.49)
    assert.strictEqual(r.priceCurrency, 'EUR')
  })

  it('parses GBP amount with £ symbol', () => {
    const r = parseUsageCost('£0.33/kWh')
    assert.strictEqual(r.pricePerKwh, 0.33)
    assert.strictEqual(r.priceCurrency, 'GBP')
  })

  it('parses USD amount with $ symbol', () => {
    const r = parseUsageCost('$0.42/kWh')
    assert.strictEqual(r.pricePerKwh, 0.42)
    assert.strictEqual(r.priceCurrency, 'USD')
  })

  it('treats "Free" (case-insensitive) as zero price', () => {
    assert.strictEqual(parseUsageCost('Free').pricePerKwh, 0)
    assert.strictEqual(parseUsageCost('free').pricePerKwh, 0)
  })

  it('treats "Безплатно" as zero price', () => {
    assert.strictEqual(parseUsageCost('Безплатно').pricePerKwh, 0)
  })

  it('returns null for empty string (unknown cost)', () => {
    const r = parseUsageCost('')
    assert.strictEqual(r.pricePerKwh, null)
    assert.strictEqual(r.priceCurrency, null)
  })

  it('returns null for null input', () => {
    const r = parseUsageCost(null)
    assert.strictEqual(r.pricePerKwh, null)
    assert.strictEqual(r.priceCurrency, null)
  })

  it('returns null for undefined input', () => {
    const r = parseUsageCost(undefined)
    assert.strictEqual(r.pricePerKwh, null)
  })

  it('returns null for non-kWh text (no price info)', () => {
    const r = parseUsageCost('Pay at machine')
    assert.strictEqual(r.pricePerKwh, null)
  })

  it('returns null when no numeric value present', () => {
    const r = parseUsageCost('per kWh - price unknown')
    assert.strictEqual(r.pricePerKwh, null)
  })
})

describe('simplifyConnectorType', () => {
  it('maps CHAdeMO', () => {
    assert.strictEqual(simplifyConnectorType('CHAdeMO'), 'CHAdeMO')
  })

  it('maps CCS Type 2', () => {
    assert.strictEqual(simplifyConnectorType('CCS (Type 2)'), 'CCS')
  })

  it('maps "Combined Charging System" to CCS', () => {
    assert.strictEqual(simplifyConnectorType('Combined Charging System (CCS) Type 2'), 'CCS')
  })

  it('maps Type 2 socket', () => {
    assert.strictEqual(simplifyConnectorType('Type 2 (Socket Only)'), 'Type2')
  })

  it('maps Mennekes (IEC 62196) to Type2', () => {
    assert.strictEqual(simplifyConnectorType('Mennekes (IEC 62196)'), 'Type2')
  })

  it('maps Tesla connector', () => {
    assert.strictEqual(simplifyConnectorType('Tesla (Roadster)'), 'Tesla')
  })

  it('maps Schuko', () => {
    assert.strictEqual(simplifyConnectorType('Schuko (Type F)'), 'Schuko')
  })

  it('maps SAE J1772 to Type1', () => {
    assert.strictEqual(simplifyConnectorType('SAE J1772-2009'), 'Type1')
  })

  it('maps unknown connector string to Other', () => {
    assert.strictEqual(simplifyConnectorType('Some Unknown Connector'), 'Other')
  })

  it('maps null to Other', () => {
    assert.strictEqual(simplifyConnectorType(null), 'Other')
  })

  it('maps undefined to Other', () => {
    assert.strictEqual(simplifyConnectorType(undefined), 'Other')
  })
})
