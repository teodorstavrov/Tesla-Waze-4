// ─── GET /api/cron/event-reminders ──────────────────────────────────────
//
// Runs daily (Vercel Cron). Two jobs:
//   1. TODAY's events → reminder email to followers + global subscribers.
//   2. TOMORROW's events → good-luck email to the organizer.
// Deduped per event/day so re-runs don't double-send.
//
// Manual: GET /api/cron/event-reminders?secret=CRON_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meetupStore } from '../_lib/meetups/store.js'
import { sendMeetupEmail, SITE_URL } from '../_lib/meetups/email.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}
const fmt = (d: Date) => d.toLocaleString('bg-BG', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env['CRON_SECRET']
  if (!secret) { res.status(503).json({ error: 'CRON_SECRET not configured' }); return }
  const headerAuth = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const querySecret = String(req.query['secret'] ?? '')
  if (headerAuth !== secret && querySecret !== secret) { res.status(401).json({ error: 'Unauthorized' }); return }

  try {
    const meetups = await meetupStore.getAllRaw()
    const subscribers = await meetupStore.getSubscribers()
    const todayKey = ymd(new Date())
    const tomorrowKey = ymd(new Date(Date.now() + 24 * 60 * 60 * 1000))

    let emailsSent = 0, eventsToday = 0, goodLuckSent = 0

    for (const m of meetups) {
      const d = new Date(m.date)
      if (isNaN(d.getTime())) continue
      const key = ymd(d)

      // ── 1) Day-of reminders ──
      if (key === todayKey) {
        eventsToday++
        const tag = `today:${m.id}:${todayKey}`
        if (!(await meetupStore.wasReminded(tag))) {
          const recipients = [...new Set([...(m.followers ?? []), ...subscribers])]
          const html = `
            <h2>📅 Днес има събитие</h2>
            <p><b>${m.title}</b></p><p>🕒 ${fmt(d)}</p>
            ${m.organizer ? `<p>👤 ${m.organizer}</p>` : ''}
            ${m.facebook ? `<p>Facebook: ${m.facebook}</p>` : ''}
            <p><a href="${SITE_URL}/?lat=${m.lat}&lng=${m.lng}">Виж на картата</a></p>
            <hr><p style="font-size:12px;color:#888">Получаваш това, защото следиш това събитие или си абониран за известия в TesRadar.</p>`
          for (const email of recipients) { await sendMeetupEmail(email, `Днес: ${m.title}`, html); emailsSent++ }
          await meetupStore.markReminded(tag)
        }
      }

      // ── 2) Good-luck to organizer, the day before ──
      if (key === tomorrowKey && m.organizerEmail) {
        const tag = `goodluck:${m.id}:${tomorrowKey}`
        if (!(await meetupStore.wasReminded(tag))) {
          await sendMeetupEmail(m.organizerEmail, `Успех с утрешното събитие: ${m.title}`, `
            <h2>🎉 Утре е твоето събитие!</h2>
            <p><b>${m.title}</b> — ${fmt(d)}</p>
            <p>Пожелаваме ти успех и страхотно настроение! ⚡</p>
            <p>Екипът на TesRadar</p>`)
          goodLuckSent++
          await meetupStore.markReminded(tag)
        }
      }
    }

    res.status(200).json({ ok: true, eventsToday, emailsSent, goodLuckSent })
  } catch (err) {
    await captureApiError(err, 'event-reminders')
    res.status(500).json({ error: 'Internal server error' })
  }
}
