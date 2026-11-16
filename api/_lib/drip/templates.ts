// ─── Re-engage email course: texts and rendering ───────────────────────
// Bulgarian for BG (and users with no country), English for everyone else.
// Texts follow the approved plan "TesRadar Re-engage план".

import { createHmac } from 'node:crypto'

export const SITE = 'https://tesradar.tech'
const TIKTOK   = 'https://www.tiktok.com/@tesradar'
const FACEBOOK = 'https://www.facebook.com/groups/1496658052161240'

export type Lang = 'bg' | 'en'
type Block = string | { ul: string[] } | { ol: string[] }
interface Mail {
  subject: string
  pre:     string
  body:    Block[]
  cta:     string
  image?:  { src: string; alt: string }
}

export function langFor(country: string): Lang {
  const c = String(country || '').trim().toUpperCase()
  return c === '' || c === 'BG' || c === 'BULGARIA' ? 'bg' : 'en'
}

const NEUTRAL_EMAIL_2 = new Set(['BE', 'DE', 'FR'])

// ── Texts ─────────────────────────────────────────────────────────────

function mailBg(n: number): Mail {
  switch (n) {
    case 1: return {
      subject: '{name}, 60 секунди до първия ти маршрут в TesRadar',
      pre: 'Три стъпки, за да работи всичко в браузъра на Tesla.',
      image: { src: `${SITE}/email/m1.jpg`, alt: 'TesRadar, отворен в браузъра на Tesla' },
      body: [
        'Здравей, {name}!',
        'Регистрира се в TesRadar. Ето как да го пуснеш в колата за по-малко от минута:',
        { ol: [
          'Отвори tesradar.tech в браузъра на Tesla и го добави в отметките, за да е на един тап.',
          'Позволи местоположението и докосни картата веднъж. Така се включва звукът на предупрежденията.',
          'Влез с имейла и PIN-а си. Приложението го помни, няма да го въвеждаш всеки път.',
        ] },
        'Забравил си PIN-а? На екрана за вход избери „Forgot PIN?“ и ще получиш нов.',
        'П.П. Ако нещо не тръгне, отговори на този имейл. Чета всеки отговор.',
      ],
      cta: 'Отвори TesRadar',
    }
    case 2: return {
      subject: 'Какво има пред теб на пътя? Общността вече знае',
      pre: 'Предупреждения с глас, преди да стигнеш мястото.',
      body: [
        'Здравей, {name}!',
        'Когато някой от общността докладва катастрофа, опасност или контрол на пътя, TesRadar те предупреждава с глас и тон, преди да стигнеш до мястото.',
        { ul: [
          'Маркерите се виждат на картата в реално време.',
          'Когато се приближиш, чуваш предупреждение и виждаш съобщение на екрана.',
          'Маркер, който вече го няма? Отхвърли го. С гласовете на шофьорите картата остава чиста.',
        ] },
        'Докладвай и ти: докосни бутона за докладване, избери тип. Отнема две докосвания.',
      ],
      cta: 'Опитай докладване',
    }
    case 3: return {
      subject: 'Колко батерия ще имаш на място? Виж преди да тръгнеш',
      pre: 'Маршрут, процент при пристигане и зарядни по пътя.',
      body: [
        'Здравей, {name}!',
        'Избери дестинация и TesRadar изчислява маршрута и колко процента батерия ще ти останат при пристигане. Зелено означава спокойно, жълто означава внимание, червено означава спри да заредиш.',
        { ul: [
          'В профила на автомобила избираш модел и текущ процент за по-точна прогноза.',
          'До 3 алтернативни маршрута, между които превключваш с един тап.',
          'Зарядни станции по трасето, с показано отклонение от маршрута.',
          'Автоматично преизчисляване, ако се отклониш с над 200 метра.',
        ] },
      ],
      cta: 'Планирай маршрут',
    }
    case 4: return {
      subject: 'Всички зарядни станции на една карта. И как да добавиш липсваща',
      pre: 'Tesla, OpenChargeMap и OpenStreetMap на един екран.',
      body: [
        'Здравей, {name}!',
        'TesRadar събира зарядни от три източника: Tesla Supercharger, OpenChargeMap и OpenStreetMap. Докосни станция и виждаш мощност, конектори, цена и статус.',
        { ul: [
          'Филтрирай по мощност (kW) и по мрежа.',
          'Липсва станция? Добави я от картата. След проверка се показва за всички.',
          'Остави коментар дали станцията работи, за следващия шофьор.',
        ] },
      ],
      cta: 'Виж зарядните около мен',
    }
    case 5: return {
      subject: 'Средна скорост: знай къде започва отсечката и какво е средното ти',
      pre: 'Предупреждение 2 км по-рано и резултат в края.',
      body: [
        'Здравей, {name}!',
        'TesRadar следи отсечки със средна скорост и ти помага да караш спокойно през тях.',
        { ul: [
          '2 километра преди отсечката получаваш предупреждение.',
          'Вътре виждаш текущата си средна скорост и оставащото разстояние.',
          'В края получаваш резултат за преминаването.',
        ] },
        'Следим 47 отсечки по магистрали и пътища от I и II клас.',
      ],
      cta: 'Виж отсечките на картата',
    }
    case 6: return {
      subject: 'Говори с TesRadar, без да пипаш екрана',
      pre: 'Докосни микрофона и попитай.',
      body: [
        'Здравей, {name}!',
        'Докосни микрофона на картата и попитай каквото ти трябва, докато караш:',
        { ul: [
          '„Колко процента батерия са ми нужни до Бургас?“ (не забравяй да настроиш профила на колата преди това)',
          '„Закарай ме до Варна“',
        ] },
        'Асистентът разбира въпроса, отговаря и може сам да започне навигация.',
      ],
      cta: 'Пробвай AI асистента',
    }
    case 7: return {
      subject: 'Дай нов глас на Tesla си: V8 двигател и мелодии при заключване',
      pre: 'Забавната част от TesRadar.',
      body: [
        'Здравей, {name}!',
        'Малко забавление след седмиците с предупреждения и маршрути:',
        { ul: [
          '<b>Двигателен звук:</b> ако ти е домъчняло за рева на мотора, пробвай симулатора на TesRadar.',
          '<b>10 мелодии при заключване:</b> от Mario Game Over до Metal Gear Solid Alert и Among Us. Чуй ги в приложението и поискай линк за сваляне по имейл.',
        ] },
        'Свалянето на мелодиите е срещу дарение, с което подкрепяш развитието на TesRadar.',
      ],
      cta: 'Чуй мелодиите',
    }
    case 8: return {
      subject: 'Tesla срещи близо до теб (и как да организираш своя)',
      pre: 'Общността на картата.',
      body: [
        'Здравей, {name}!',
        'Tesla шофьорите се събират, а TesRadar ги показва на картата.',
        { ul: [
          'Виж предстоящите срещи, последвай ги и получи напомняне в деня.',
          'Организираш? Добави събитие, дори повтарящо се: седмично, на две седмици или месечно.',
          'Само ти, като създател, можеш да го редактираш.',
        ] },
        'Знаеш за среща, която липсва? Добави я за минута.',
      ],
      cta: 'Виж срещите',
    }
    case 9: return {
      subject: 'Студът краде обхват. Ето как да планираш спокойно',
      pre: 'Любими места и прогноза с отчетена деградация на батерията.',
      body: [
        'Здравей, {name}!',
        'През зимата обхватът намалява. TesRadar взема предвид профила и състоянието на батерията в прогнозата.',
        { ul: [
          'Запази дома, работата и любимите места със звездичка ⭐ в търсенето и стигай до тях с два тапа.',
          'Последните 10 търсения са под ръка.',
          'Планирай по-голям резерв при минусови температури и стигай до зарядно със запас.',
        ] },
        'Съвет: предварително затопли колата, докато е на зарядно.',
      ],
      cta: 'Запази първото си място',
    }
    default: return {
      subject: 'Една минута за TesRadar и какво идва през 2027',
      pre: 'Две молби от един човек, който го прави.',
      body: [
        'Здравей, {name}!',
        'Благодаря, че си с нас през тези седмици. Имам две молби:',
        { ol: [
          'Оцени TesRadar с 1 до 5 звезди. Отнема 10 секунди и ми показва какво да оправя.',
          'Отговори на този имейл: коя функция ползваш най-много и какво ти липсва?',
        ] },
        'Познаваш друг Tesla шофьор? Прати му tesradar.tech. Така приложението расте без реклама.',
        'Ако искаш да подкрепиш развитието, виж „Подкрепи“ в приложението.',
        'Теодор, TesRadar',
      ],
      cta: 'Оцени TesRadar',
    }
  }
}

function mailEn(n: number, country: string): Mail {
  const cc = String(country || '').trim().toUpperCase()
  switch (n) {
    case 1: return {
      subject: '{name}, 60 seconds to your first TesRadar route',
      pre: 'Three steps to get everything working in your Tesla browser.',
      image: { src: `${SITE}/email/m1.jpg`, alt: 'TesRadar open in the Tesla browser' },
      body: [
        'Hi {name}!',
        'You signed up for TesRadar. Here is how to get it running in your car in under a minute:',
        { ol: [
          'Open tesradar.tech in the Tesla browser and bookmark it, so it is one tap away.',
          'Allow location and tap the map once. That turns on the alert sounds.',
          'Sign in with your email and PIN. The app remembers it, so you will not type it every time.',
        ] },
        'Forgot your PIN? On the sign-in screen choose “Forgot PIN?” and we will send you a new one.',
        'P.S. If something does not work, just reply to this email. I read every reply.',
      ],
      cta: 'Open TesRadar',
    }
    case 2: return NEUTRAL_EMAIL_2.has(cc) ? {
      subject: 'Hazards and roadworks on your route, reported by the community',
      pre: 'Voice alerts before you reach the spot.',
      body: [
        'Hi {name}!',
        'When someone in the community reports a crash, a hazard or roadworks, TesRadar warns you with a voice alert before you get there.',
        { ul: [
          'Markers show up on the map in real time.',
          'As you get close, you hear an alert and see a message on screen.',
          'Marker no longer there? Dismiss it. Drivers’ votes keep the map clean.',
        ] },
        'Report one yourself: tap the report button and pick a type. It takes two taps.',
      ],
      cta: 'Try reporting',
    } : {
      subject: 'What is on the road ahead? The community already knows',
      pre: 'Voice alerts before you reach the spot.',
      body: [
        'Hi {name}!',
        'When someone in the community reports a crash, a hazard or a police check, TesRadar warns you with a voice alert and a tone before you get there.',
        { ul: [
          'Markers show up on the map in real time.',
          'As you get close, you hear an alert and see a message on screen.',
          'Marker no longer there? Dismiss it. Drivers’ votes keep the map clean.',
        ] },
        'Report one yourself: tap the report button and pick a type. It takes two taps.',
      ],
      cta: 'Try reporting',
    }
    case 3: return {
      subject: 'How much battery will you have on arrival? Check before you leave',
      pre: 'Route, arrival percentage and chargers along the way.',
      body: [
        'Hi {name}!',
        'Pick a destination and TesRadar works out the route and how much battery you will have left on arrival. Green means relax, yellow means watch it, red means stop to charge.',
        { ul: [
          'Set your model and current charge in the vehicle profile for a more accurate estimate.',
          'Up to 3 alternative routes you can switch between with one tap.',
          'Chargers along the route, with the detour shown.',
          'Automatic recalculation if you go more than 200 metres off route.',
        ] },
      ],
      cta: 'Plan a route',
    }
    case 4: return {
      subject: 'Every charger on one map. And how to add a missing one',
      pre: 'Tesla, OpenChargeMap and OpenStreetMap on one screen.',
      body: [
        'Hi {name}!',
        'TesRadar pulls chargers from three sources: Tesla Superchargers, OpenChargeMap and OpenStreetMap. Tap a station to see power, connectors, price and status.',
        { ul: [
          'Filter by power (kW) and by network.',
          'Station missing? Add it from the map. Once checked, everyone sees it.',
          'Leave a comment on whether the station works, for the next driver.',
        ] },
      ],
      cta: 'See chargers near me',
    }
    case 5: return {
      subject: 'Average speed sections: know where they start and what your average is',
      pre: 'An alert 2 km ahead and your result at the end.',
      body: [
        'Hi {name}!',
        'TesRadar tracks average speed sections and helps you drive through them calmly.',
        { ul: [
          'You get an alert 2 kilometres before the section.',
          'Inside, you see your current average speed and the distance left.',
          'At the end, you get your result for the section.',
        ] },
        ...(cc === 'NL' ? ['In the Netherlands we cover trajectcontrole sections.'] : []),
      ],
      cta: 'See the sections on the map',
    }
    case 6: return {
      subject: 'Talk to TesRadar without touching the screen',
      pre: 'Tap the microphone and ask.',
      body: [
        'Hi {name}!',
        'Tap the microphone on the map and ask what you need while you drive:',
        { ul: [
          '“How much battery do I need to get to Milan?” (set up your car profile first)',
          '“Take me to Munich”',
        ] },
        'The assistant understands the question, answers and can start navigation on its own.',
      ],
      cta: 'Try the AI assistant',
    }
    case 7: return {
      subject: 'Give your Tesla a new voice: engine sounds and lock chimes',
      pre: 'The fun side of TesRadar.',
      body: [
        'Hi {name}!',
        'A bit of fun after weeks of alerts and routes:',
        { ul: [
          '<b>Engine sound:</b> miss the roar of an engine? Try the TesRadar simulator.',
          '<b>10 lock chimes:</b> from Mario Game Over to Metal Gear Solid Alert and Among Us. Listen in the app and request a download link by email.',
        ] },
        'Downloading the chimes is by donation, which supports the development of TesRadar.',
      ],
      cta: 'Listen to the chimes',
    }
    case 8: return {
      subject: 'Tesla meetups near you (and how to host your own)',
      pre: 'The community on the map.',
      body: [
        'Hi {name}!',
        'Tesla drivers get together, and TesRadar shows the meetups on the map.',
        { ul: [
          'See upcoming meetups, follow them and get a reminder on the day.',
          'Organising one? Add an event, even a recurring one: weekly, every two weeks or monthly.',
          'Only you, as the creator, can edit it.',
        ] },
        'Know a meetup that is missing? Add it in a minute.',
      ],
      cta: 'See meetups',
    }
    case 9: return {
      subject: 'Cold weather steals range. Here is how to plan calmly',
      pre: 'Favourite places and a forecast that accounts for battery wear.',
      body: [
        'Hi {name}!',
        'Range drops in winter. TesRadar takes your battery profile and condition into account in its forecast.',
        { ul: [
          'Save home, work and favourite places with the star ⭐ in search and get there in two taps.',
          'Your last 10 searches are always at hand.',
          'Plan a bigger buffer in sub-zero temperatures and reach chargers with charge to spare.',
        ] },
        'Tip: precondition the car while it is still plugged in.',
      ],
      cta: 'Save your first place',
    }
    default: return {
      subject: 'One minute for TesRadar, and what is coming in 2027',
      pre: 'Two requests from the person who builds it.',
      body: [
        'Hi {name}!',
        'Thank you for being with us these past weeks. I have two requests:',
        { ol: [
          'Rate TesRadar from 1 to 5 stars. It takes 10 seconds and shows me what to fix.',
          'Reply to this email: which feature do you use most, and what is missing?',
        ] },
        'Know another Tesla driver? Send them tesradar.tech. That is how the app grows without ads.',
        'If you would like to support development, see “Support” in the app.',
        'Teodor, TesRadar',
      ],
      cta: 'Rate TesRadar',
    }
  }
}

const UI = {
  bg: {
    from:   'Теодор от TesRadar <noreply@tesradar.tech>',
    social: 'Последвай TesRadar за кратки видеа, нови функции и новини от общността:',
    fbLabel: 'Facebook група',
    why:    'Получаваш този имейл, защото си регистриран в TesRadar.',
    unsub:  'Отпиши се',
  },
  en: {
    from:   'Teodor from TesRadar <noreply@tesradar.tech>',
    social: 'Follow TesRadar for short videos, new features and community news:',
    fbLabel: 'Facebook group',
    why:    'You are receiving this because you registered for TesRadar.',
    unsub:  'Unsubscribe',
  },
} as const

// ── Unsubscribe links ────────────────────────────────────────────────

export function unsubToken(email: string): string {
  const secret = process.env['DRIP_SECRET'] ?? ''
  if (!secret) throw new Error('DRIP_SECRET not configured')
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export function unsubUrl(email: string): string {
  const e = email.trim().toLowerCase()
  return `${SITE}/api/email/unsubscribe?e=${encodeURIComponent(e)}&t=${unsubToken(e)}`
}

// ── Rendering ─────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const stripTags = (s: string) => s.replace(/<[^>]+>/g, '')

export interface RenderedMail {
  from:    string
  subject: string
  html:    string
  text:    string
  headers: Record<string, string>
}

export function renderMail(n: number, user: { name: string; email: string; country: string }): RenderedMail {
  const lang  = langFor(user.country)
  const mail  = lang === 'bg' ? mailBg(n) : mailEn(n, user.country)
  const ui    = UI[lang]
  const first = (user.name || '').trim().split(/\s+/)[0] || (lang === 'bg' ? 'приятелю' : 'there')
  const nameH = esc(first)
  const fill  = (s: string) => s.replace(/\{name\}/g, nameH)
  const link  = `${SITE}/?utm_source=email&utm_medium=drip&utm_campaign=reengage_2026q4&utm_content=e${n}`
  const unsub = unsubUrl(user.email)
  const p     = 'margin:0 0 14px;font-size:16px;line-height:1.55;color:#14171c'

  let bodyHtml = ''
  let bodyText = ''
  mail.body.forEach((b, i) => {
    if (typeof b === 'string') {
      bodyHtml += `<p style="${p}">${fill(b)}</p>`
      bodyText += stripTags(fill(b)) + '\n\n'
    } else {
      const items = 'ul' in b ? b.ul : b.ol
      const tag   = 'ul' in b ? 'ul' : 'ol'
      bodyHtml += `<${tag} style="margin:0 0 14px;padding-left:22px;font-size:16px;line-height:1.55;color:#14171c">${items.map((x) => `<li style="margin:0 0 6px">${fill(x)}</li>`).join('')}</${tag}>`
      bodyText += items.map((x, k) => `${'ul' in b ? '•' : `${k + 1}.`} ${stripTags(fill(x))}`).join('\n') + '\n\n'
    }
    if (i === 1 && mail.image) {
      bodyHtml += `<p style="margin:0 0 18px"><img src="${mail.image.src}" width="544" alt="${esc(mail.image.alt)}" style="display:block;width:100%;max-width:544px;height:auto;border-radius:10px;border:1px solid #dde1e7"></p>`
    }
  })

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${esc(mail.pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #dde1e7">
<tr><td style="padding:22px 28px;border-bottom:3px solid #da0708;font-size:20px;font-weight:bold;color:#14171c">TesRadar</td></tr>
<tr><td style="padding:28px">
${bodyHtml}
<p style="margin:22px 0 24px"><a href="${link}" style="display:inline-block;background:#da0708;color:#ffffff;font-weight:bold;font-size:16px;text-decoration:none;padding:12px 22px;border-radius:8px">${esc(mail.cta)}</a></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;background:#f4f5f7;border-radius:8px"><tr><td style="padding:14px 16px;font-size:14px;color:#14171c">
${esc(ui.social)}<br>
<a href="${TIKTOK}" style="display:inline-block;margin:10px 8px 0 0;padding:7px 12px;border:1px solid #dde1e7;border-radius:7px;background:#fff;color:#14171c;font-weight:bold;text-decoration:none">TikTok · @tesradar</a>
<a href="${FACEBOOK}" style="display:inline-block;margin:10px 0 0;padding:7px 12px;border:1px solid #dde1e7;border-radius:7px;background:#fff;color:#14171c;font-weight:bold;text-decoration:none">${esc(ui.fbLabel)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #dde1e7;font-size:12px;color:#5b6472">${esc(ui.why)} <a href="${unsub}" style="color:#5b6472">${esc(ui.unsub)}</a></td></tr>
</table></td></tr></table></body></html>`

  const text = `${bodyText}${mail.cta}: ${link}\n\n${ui.social}\nTikTok: ${TIKTOK}\nFacebook: ${FACEBOOK}\n\n${ui.why}\n${ui.unsub}: ${unsub}\n`

  return {
    from:    ui.from,
    subject: mail.subject.replace(/\{name\}/g, first),
    html,
    text,
    headers: {
      'List-Unsubscribe':      `<${unsub}>, <mailto:contact@tesradar.tech?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
