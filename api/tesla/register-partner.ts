// ─── POST /api/tesla/register-partner ────────────────────────────────────────
// ONE-TIME admin endpoint: registers the Tesla app (partner) with the EU
// Fleet API region. Must be called once before any user OAuth will work.
//
// Tesla requires every partner app to POST to /api/1/partner_accounts on each
// regional Fleet API base URL they use. Without this, user tokens return 412.
//
// Reference:
//   https://developer.tesla.com/docs/fleet-api/endpoints/partner-endpoints#register
//
// Protection: requires X-Admin-Secret header matching ADMIN_SECRET env var.
// Usage:
//   curl -X POST https://tesradar.tech/api/tesla/register-partner \
//        -H "X-Admin-Secret: <your-secret>"

import type { VercelRequest, VercelResponse } from '@vercel/node'

const TESLA_AUTH_BASE = 'https://auth.tesla.com/oauth2/v3'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed — use POST' })
    return
  }

  // Admin secret guard
  const adminSecret = process.env['ADMIN_SECRET']
  if (!adminSecret) {
    res.status(500).json({ error: 'ADMIN_SECRET env var not configured on this deployment' })
    return
  }
  if (req.headers['x-admin-secret'] !== adminSecret) {
    res.status(403).json({ error: 'Forbidden — invalid or missing X-Admin-Secret header' })
    return
  }

  const clientId     = process.env['TESLA_CLIENT_ID']
  const clientSecret = process.env['TESLA_CLIENT_SECRET']
  const apiBase      = process.env['TESLA_API_BASE_URL'] ?? 'https://fleet-api.prd.eu.vn.cloud.tesla.com'
  const domain       = process.env['TESLA_APP_DOMAIN']  ?? 'tesradar.tech'

  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'TESLA_CLIENT_ID or TESLA_CLIENT_SECRET not configured' })
    return
  }

  // ── Step 1: Get partner-level token (client credentials) ─────────────────

  let partnerToken: string
  try {
    const tokenRes = await fetch(`${TESLA_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'openid vehicle_device_data vehicle_location vehicle_cmds vehicle_charging_cmds',
        audience:      apiBase,
      }),
    })

    const tokenBody = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string }

    if (!tokenRes.ok || !tokenBody.access_token) {
      res.status(502).json({
        error:   'Failed to obtain partner token from Tesla',
        status:  tokenRes.status,
        details: tokenBody,
      })
      return
    }

    partnerToken = tokenBody.access_token
  } catch (err) {
    res.status(502).json({ error: 'Network error fetching partner token', details: String(err) })
    return
  }

  // ── Step 2: Register partner with the Fleet API region ───────────────────

  try {
    const regRes = await fetch(`${apiBase}/api/1/partner_accounts`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${partnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain }),
    })

    const regBody = await regRes.json() as unknown

    res.status(200).json({
      success:         regRes.ok,
      http_status:     regRes.status,
      api_base:        apiBase,
      domain_sent:     domain,
      tesla_response:  regBody,
    })
  } catch (err) {
    res.status(502).json({ error: 'Network error calling partner_accounts', details: String(err) })
  }
}
