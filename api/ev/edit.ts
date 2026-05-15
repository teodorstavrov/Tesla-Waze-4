// ─── PUT /api/ev/edit  — update user station (owner-token verified)
//     DELETE /api/ev/edit — delete user station (owner-token verified)
//
// Both require { id, ownerToken } in the JSON body.
// The ownerToken was returned at submission time and stored client-side.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { userStationDb } from '../_lib/db/userStationDb.js'
import { cacheDel } from '../_lib/cache/memory.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'
import type { Connector } from '../_lib/normalize/types.js'

const USER_STATIONS_CACHE_KEY = 'user-stations-all'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  const body       = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const id         = String(body?.id         ?? '').trim()
  const ownerToken = String(body?.ownerToken ?? '').trim()

  if (!id || !ownerToken) {
    res.status(400).json({ error: 'Missing id or ownerToken' })
    return
  }

  try {
    // ── DELETE ───────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const result = await userStationDb.deleteByOwner(id, ownerToken)
      if (result === 'not_found') { res.status(404).json({ error: 'Station not found' }); return }
      if (result === 'forbidden') { res.status(403).json({ error: 'Invalid owner token' }); return }
      cacheDel(USER_STATIONS_CACHE_KEY)
      res.status(200).json({ ok: true, deleted: id })
      return
    }

    // ── PUT (update) ─────────────────────────────────────────────
    if (req.method === 'PUT') {
      const rawConnectors = Array.isArray(body?.connectors) ? body.connectors as Array<{ type: string; powerKw?: number; count?: number }> : undefined

      let connectors: Connector[] | undefined
      if (rawConnectors) {
        connectors = rawConnectors
          .filter((c) => c.type)
          .map((c) => ({
            type:    String(c.type).slice(0, 50),
            powerKw: c.powerKw != null ? parseFloat(String(c.powerKw)) || null : null,
            count:   Math.max(1, parseInt(String(c.count ?? '1'), 10) || 1),
          }))
        if (connectors.length === 0) connectors = [{ type: 'Other', powerKw: null, count: 1 }]
      }

      const maxPowerKw = connectors
        ? connectors.reduce<number | null>((max, c) => {
            if (c.powerKw == null || !isFinite(c.powerKw)) return max
            return max == null ? c.powerKw : Math.max(max, c.powerKw)
          }, null)
        : undefined

      const changes = {
        ...(body?.name    != null ? { name:    String(body.name).trim().slice(0, 200) } : {}),
        ...(body?.address != null ? { address: String(body.address).trim().slice(0, 300) || null } : {}),
        ...(body?.city    != null ? { city:    String(body.city).trim().slice(0, 100) || null } : {}),
        ...(body?.network != null ? { network: String(body.network).trim().slice(0, 100) || null } : {}),
        ...(body?.submitterNotes != null ? { submitterNotes: String(body.submitterNotes).trim().slice(0, 1000) || null } : {}),
        ...(body?.isFree  != null ? { isFree:  body.isFree === true ? true : body.isFree === false ? false : null } : {}),
        ...(body?.pricePerKwh != null ? { pricePerKwh: parseFloat(String(body.pricePerKwh)) || null } : {}),
        ...(body?.priceCurrency != null ? { priceCurrency: String(body.priceCurrency).trim().toUpperCase().slice(0, 3) || null } : {}),
        ...(connectors ? { connectors, totalPorts: connectors.reduce((s, c) => s + c.count, 0), maxPowerKw } : {}),
      }

      if (Object.keys(changes).length === 0) {
        res.status(400).json({ error: 'No fields to update' })
        return
      }

      const result = await userStationDb.update(id, ownerToken, changes)
      if (result === 'not_found') { res.status(404).json({ error: 'Station not found' }); return }
      if (result === 'forbidden') { res.status(403).json({ error: 'Invalid owner token' }); return }

      cacheDel(USER_STATIONS_CACHE_KEY)
      res.status(200).json({ ok: true, updated: id })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    await captureApiError(err, 'ev/edit')
    res.status(500).json({ error: 'Internal server error' })
  }
}
