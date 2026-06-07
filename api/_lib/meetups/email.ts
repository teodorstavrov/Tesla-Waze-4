// ─── Resend email helper for meetups ────────────────────────────────────

const RESEND_API_KEY = process.env['RESEND_API_KEY']
const FROM_EMAIL     = 'TesRadar <noreply@tesradar.tech>'
export const ADMIN_EMAIL = 'teodorstavrov@gmail.com'
export const SITE_URL    = 'https://tesradar.tech'

/** Best-effort email send. Never throws (callers shouldn't fail because of email). */
export async function sendMeetupEmail(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  if (!RESEND_API_KEY) { console.log('[meetup-email] would send to', to, '|', subject); return }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    })
  } catch (err) {
    console.warn('[meetup-email] send failed:', String(err))
  }
}
