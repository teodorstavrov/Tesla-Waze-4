// ─── GET    /api/admin/meetups       — list all community meetups ───────
// ─── DELETE /api/admin/meetups?id=   — remove a meetup by id ────────────
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { meetupStore } from '../_lib/meetups/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (!isAuthorized(req))       { unauthorized(res); return }

  if (req.method === 'GET') {
    const meetups = await meetupStore.getAll()  // ownerToken stripped
    res.status(200).json({ meetups })
    return
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) as Record<string, unknown> : req.body as Record<string, unknown>
    const id = String(body?.['id'] ?? '')
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }

    const patch: Parameters<typeof meetupStore.adminUpdate>[1] = {}
    if (body['title']          != null) patch.title          = String(body['title']).trim().slice(0, 120)
    if (body['date']           != null) patch.date           = String(body['date'])
    if (body['organizer']      != null) patch.organizer      = String(body['organizer']).trim() || null
    if (body['organizerPhone'] != null) patch.organizerPhone = String(body['organizerPhone']).trim() || null
    if (body['organizerEmail'] != null) patch.organizerEmail = String(body['organizerEmail']).trim() || null
    if (body['facebook']       != null) patch.facebook       = String(body['facebook']).trim() || null
    if (body['lat']            != null) { const v = Number(body['lat']); if (isFinite(v)) patch.lat = v }
    if (body['lng']            != null) { const v = Number(body['lng']); if (isFinite(v)) patch.lng = v }

    const updated = await meetupStore.adminUpdate(id, patch)
    if (!updated) { res.status(404).json({ error: 'Meetup not found' }); return }
    res.status(200).json({ meetup: updated })
    return
  }

  if (req.method === 'DELETE') {
    const id = String(req.query['id'] ?? '')
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }
    const ok = await meetupStore.remove(id)
    res.status(ok ? 200 : 404).json({ ok })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
