// ─── Terms of Service + Privacy Policy Modal ─────────────────────────
// Opens via openTermsModal(). Mounted once in App.tsx.
// Touch-optimised for Tesla browser: large tap targets, scrollable body.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { isTeslaBrowser } from '@/lib/browser'
import { getLang, langStore } from '@/lib/locale'
import { useSyncExternalStore } from 'react'

// ── Module-level opener ───────────────────────────────────────────────

let _open: (() => void) | null = null

export function openTermsModal(): void {
  _open?.()
}

// ── Legal content ─────────────────────────────────────────────────────

type Tab = 'terms' | 'privacy'

const CONTENT = {
  bg: {
    tabs: { terms: 'Общи условия', privacy: 'Поверителност' },
    terms: {
      title: 'Общи условия за ползване на TesRadar',
      updated: 'Последна актуализация: юни 2026 г.',
      sections: [
        {
          heading: '1. За приложението',
          body: 'TesRadar е независимо уеб приложение за навигация и информация за EV зарядни станции, създадено от независим разработчик. Приложението не е свързано, одобрено или спонсорирано от Tesla, Inc., нито от каквато и да е друга компания. „Tesla" е запазена марка на Tesla, Inc.',
        },
        {
          heading: '2. Приемане на условията',
          body: 'С достъпа до и използването на TesRadar вие потвърждавате, че сте прочели, разбрали и се съгласявате с тези Общи условия. Ако не сте съгласни с тях, моля, прекратете използването на приложението.',
        },
        {
          heading: '3. Описание на услугата',
          body: 'TesRadar предоставя: информация за EV зарядни станции (наличност, мощност, цена), известия за пътни събития (полиция, катастрофи, задръствания, ремонти), навигация и маршрутизация, данни за скоростни камери и контролни участъци, и опционална свързаност с Tesla превозни средства.\n\nЦялата информация се предоставя в наличния вид („as is") без гаранции за точност, актуалност или пълнота.',
        },
        {
          heading: '4. Ограничение на отговорността',
          body: 'В максималната степен, разрешена от закона, TesRadar и неговите автори НЕ носят отговорност за:\n• Неточности в навигацията или пътните данни\n• Пътно-транспортни произшествия, наранявания или имуществени вреди\n• Решения, взети въз основа на информация от приложението\n• Прекъсвания или недостъпност на услугата\n• Загуба на данни\n\nВие носите пълна отговорност за безопасното управление на автомобила. Никога не отвличайте вниманието от пътя.',
        },
        {
          heading: '5. Потребителско съдържание',
          body: 'При докладване на събития или добавяне на зарядни станции вие: гарантирате, че публикуваната информация е вярна и актуална; приемате, че съдържанието може да бъде редактирано или изтрито от администратори без предизвестие; поемате отговорност за точността на публикуваното съдържание; и се съгласявате да не публикувате невярна, подвеждаща или злонамерена информация.',
        },
        {
          heading: '6. Забранено ползване',
          body: 'Забранено е: автоматизирано събиране на данни (scraping) от приложението; опити за нарушаване на сигурността или функционалността; и публикуване на невярна информация с цел въвеждане в заблуда.',
        },
        {
          heading: '7. Интелектуална собственост',
          body: 'Изходният код, дизайнът и логото на TesRadar са собственост на разработчика. Картните данни са предоставени от OpenStreetMap (© OpenStreetMap contributors) под лиценза ODbL.',
        },
        {
          heading: '8. Промени в услугата',
          body: 'Разработчикът си запазва правото да промени, прекъсне или прекрати услугата по всяко време без предизвестие. Тези условия могат да бъдат актуализирани — продължаването на ползването на приложението означава приемане на новите условия.',
        },
        {
          heading: '9. Приложимо право',
          body: 'Тези условия се управляват от законодателството на Република България. При спорове е приложима юрисдикцията на компетентния български съд.',
        },
      ],
    },
    privacy: {
      title: 'Политика за поверителност на TesRadar',
      updated: 'Последна актуализация: юни 2026 г.',
      sections: [
        {
          heading: '1. Администратор на данни',
          body: 'TesRadar е независим проект, управляван от физическо лице — независим разработчик на софтуер. Можете да се свържете с нас чрез формата за контакт в приложението (раздел „Подкрепи проекта").',
        },
        {
          heading: '2. Какви данни събираме',
          body: 'Автоматично събирани данни:\n• Анонимна аналитика: Vercel Analytics събира анонимни данни за посещения (брой, страна, тип устройство) без лична идентификация.\n• IP адрес: логван от хостинг платформата (Vercel) за стандартни оперативни цели.\n• Мониторинг на грешки: Sentry може да регистрира анонимни технически грешки.\n\nДанни, предоставени от вас:\n• Доклади за събития: тип и GPS координати.\n• Зарядни станции: данните, въведени при добавяне.\n• Съобщения за контакт: текст и имейл адрес.\n• Tesla свързаност (по избор): OAuth access token, съхраняван само в сесията на браузъра.\n\nДанни, останали само на вашето устройство:\n• GPS координати — обработват се локално и НЕ се изпращат на нашите сървъри.\n• Настройки, история на търсенето и любими места — в localStorage.',
        },
        {
          heading: '3. Как използваме данните',
          body: 'Данните се използват за: предоставяне и подобряване на услугата; анализ на анонимни тенденции в използването; отговор на запитвания чрез формата за контакт; и осигуряване на техническата стабилност.',
        },
        {
          heading: '4. Трети страни',
          body: 'Използваме следните услуги на трети страни, всяка с собствена политика за поверителност:\n• Vercel — хостинг и анонимна аналитика\n• OpenStreetMap — картни данни\n• OSRM / Valhalla — маршрутизация\n• Sentry — мониторинг на грешки\n• Stripe — при дарения (ако е избрано)',
        },
        {
          heading: '5. Бисквитки и локално съхранение',
          body: 'Не използваме рекламни или маркетингови бисквитки. Използваме localStorage за: потребителски настройки (тема, страна, език), история на търсенето, и любими места.',
        },
        {
          heading: '6. Права по GDPR',
          body: 'Ако сте резидент на ЕС, имате право на: достъп до данните, които сте предоставили; коригиране на неточни данни; изтриване на вашето съдържание (доклади, коментари); и ограничаване на обработката.\n\nЗа упражняване на тези права се свържете с нас чрез формата за контакт в приложението.',
        },
        {
          heading: '7. Съхранение на данни',
          body: 'Потребителско съдържание (доклади за събития, зарядни станции) се съхранява на сървъри на Vercel в рамките на ЕС/ЕИП. Данните се съхраняват докато услугата е активна или до поискване за изтриване.',
        },
        {
          heading: '8. Промени в политиката',
          body: 'При съществени промени ще уведомим потребителите чрез актуализация в приложението. Продължаването на ползването след промените означава тяхното приемане.',
        },
      ],
    },
  },

  en: {
    tabs: { terms: 'Terms of Service', privacy: 'Privacy Policy' },
    terms: {
      title: 'TesRadar Terms of Service',
      updated: 'Last updated: June 2026',
      sections: [
        {
          heading: '1. About TesRadar',
          body: 'TesRadar is an independent web application for EV navigation and charging station information, built by an independent developer. TesRadar is not affiliated with, endorsed by, or sponsored by Tesla, Inc. or any of its subsidiaries. "Tesla" is a registered trademark of Tesla, Inc.',
        },
        {
          heading: '2. Acceptance of Terms',
          body: 'By accessing or using TesRadar, you confirm that you have read, understood, and agree to these Terms of Service. If you do not agree, please discontinue use of the application.',
        },
        {
          heading: '3. Service Description',
          body: 'TesRadar provides: EV charging station information (availability, power, pricing); road event alerts (police, accidents, traffic, road works); navigation and routing; speed camera and average speed zone data; and optional Tesla vehicle connectivity.\n\nAll information is provided "as is" without any warranty of accuracy, timeliness, or completeness.',
        },
        {
          heading: '4. Limitation of Liability',
          body: 'To the fullest extent permitted by law, TesRadar and its developers shall NOT be liable for:\n• Inaccuracies in navigation or road data\n• Traffic accidents, injuries, or property damage\n• Decisions made based on information from the application\n• Service interruptions or unavailability\n• Loss of data\n\nYou are solely responsible for the safe operation of your vehicle. Never allow the app to distract you from driving.',
        },
        {
          heading: '5. User-Generated Content',
          body: 'When reporting events or adding charging stations, you: warrant that the information you submit is accurate and current; acknowledge that content may be edited or removed by administrators without notice; accept responsibility for the accuracy of your submissions; and agree not to submit false, misleading, or malicious information.',
        },
        {
          heading: '6. Prohibited Use',
          body: 'You may not: scrape or automatically extract data from the application; attempt to compromise security or functionality; or submit false information with intent to mislead.',
        },
        {
          heading: '7. Intellectual Property',
          body: 'The source code, design, and logo of TesRadar are the property of the developer. Map data is provided by OpenStreetMap (© OpenStreetMap contributors) under the ODbL license.',
        },
        {
          heading: '8. Service Changes',
          body: 'The developer reserves the right to modify, suspend, or discontinue the service at any time without notice. These Terms may be updated — continued use of the application constitutes acceptance of the updated terms.',
        },
        {
          heading: '9. Governing Law',
          body: 'These Terms are governed by the laws of the Republic of Bulgaria.',
        },
      ],
    },
    privacy: {
      title: 'TesRadar Privacy Policy',
      updated: 'Last updated: June 2026',
      sections: [
        {
          heading: '1. Data Controller',
          body: 'TesRadar is an independent project operated by an individual developer. You can contact us via the in-app contact form (under "Support the Project").',
        },
        {
          heading: '2. Data We Collect',
          body: 'Automatically collected:\n• Anonymous analytics: Vercel Analytics collects anonymous usage data (visit counts, country, device type) with no personal identification.\n• IP address: logged by the hosting platform (Vercel) for standard operational purposes.\n• Error monitoring: Sentry may log anonymous technical errors.\n\nData you provide:\n• Event reports: event type and GPS coordinates.\n• Charging stations: details you enter when adding a station.\n• Contact messages: text and email address.\n• Tesla connectivity (optional): OAuth access token stored only in your browser session.\n\nData that stays on your device:\n• GPS coordinates — processed locally and NOT sent to our servers.\n• Settings, search history, and saved places — stored in localStorage.',
        },
        {
          heading: '3. How We Use Your Data',
          body: 'Data is used to: provide and improve the service; analyse anonymous usage trends; respond to contact form inquiries; and maintain the technical stability of the application.',
        },
        {
          heading: '4. Third-Party Services',
          body: 'We use the following third-party services, each with their own privacy policy:\n• Vercel — hosting and anonymous analytics\n• OpenStreetMap — map data\n• OSRM / Valhalla — routing\n• Sentry — error monitoring\n• Stripe — for donations (if chosen)',
        },
        {
          heading: '5. Cookies and Local Storage',
          body: 'We do not use advertising or marketing cookies. We use localStorage for: user preferences (theme, country, language), search history, and saved places.',
        },
        {
          heading: '6. Your GDPR Rights',
          body: 'If you are an EU resident, you have the right to: access the data you have provided; correct inaccurate data; request deletion of your content (reports, comments); and restrict processing.\n\nTo exercise your rights, contact us via the in-app contact form.',
        },
        {
          heading: '7. Data Retention',
          body: 'User-generated content (event reports, charging stations) is stored on Vercel servers within the EU/EEA. Data is retained while the service is active or until you request deletion.',
        },
        {
          heading: '8. Policy Changes',
          body: 'For significant changes, we will notify users via an update in the application. Continued use after changes constitutes acceptance.',
        },
      ],
    },
  },
} as const

// ── Component ─────────────────────────────────────────────────────────

export function TermsModal() {
  const [open,  setOpen]  = useState(false)
  const [shown, setShown] = useState(false)
  const [tab,   setTab]   = useState<Tab>('terms')

  useSyncExternalStore(langStore.subscribe, getLang, getLang)

  _open = () => {
    setOpen(true)
    setTab('terms')
    if (isTeslaBrowser) {
      setShown(true)
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }
  }

  const close = useCallback(() => {
    setShown(false)
    setTimeout(() => setOpen(false), isTeslaBrowser ? 0 : 220)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const lang   = getLang()
  const locale = (lang === 'bg') ? 'bg' : 'en'
  const data   = CONTENT[locale]

  return createPortal(
    <div
      style={{
        position:  'fixed',
        inset:     0,
        zIndex:    900,
        display:   'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity:    shown ? 1 : 0,
        transition: 'opacity 0.22s ease',
      }}
    >
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={close}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={data.tabs[tab]}
        style={{
          position:      'relative',
          zIndex:        1,
          width:         'min(640px, calc(100vw - 32px))',
          height:        'min(82vh, 760px)',
          borderRadius:  20,
          background:    'rgba(14, 14, 22, 0.99)',
          border:        '1px solid rgba(255,255,255,0.12)',
          boxShadow:     '0 24px 72px rgba(0,0,0,0.7)',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          opacity:       shown ? 1 : 0,
          transform:     shown ? 'scale(1)' : 'scale(0.96)',
          transition:    'opacity 0.22s ease-out, transform 0.22s ease-out',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          padding:      '16px 20px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink:   0,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['terms', 'privacy'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding:      '8px 16px',
                  borderRadius: 10,
                  border:       'none',
                  background:   tab === t ? 'rgba(227,25,55,0.85)' : 'rgba(255,255,255,0.08)',
                  color:        tab === t ? '#fff' : 'rgba(255,255,255,0.55)',
                  fontSize:     14,
                  fontWeight:   600,
                  cursor:       'pointer',
                  touchAction:  'manipulation',
                  transition:   'background 0.15s ease',
                }}
              >
                {data.tabs[t]}
              </button>
            ))}
          </div>

          <button
            onClick={close}
            aria-label="Затвори"
            style={{
              width:        40,
              height:       40,
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              borderRadius: 10,
              background:   'rgba(255,255,255,0.07)',
              border:       '1px solid rgba(255,255,255,0.1)',
              color:        'rgba(255,255,255,0.5)',
              cursor:       'pointer',
              touchAction:  'manipulation',
              flexShrink:   0,
            }}
          >
            <CloseX />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          style={{
            flex:       1,
            overflowY:  'auto',
            padding:    '20px 24px 28px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <TabContent data={data[tab]} />
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding:      '12px 24px',
          borderTop:    '1px solid rgba(255,255,255,0.07)',
          flexShrink:   0,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
            TesRadar — tesradar.tech
          </span>
          <button
            onClick={close}
            style={{
              padding:      '10px 24px',
              borderRadius: 10,
              background:   'rgba(255,255,255,0.09)',
              border:       '1px solid rgba(255,255,255,0.14)',
              color:        '#f2f2f2',
              fontSize:     14,
              fontWeight:   600,
              cursor:       'pointer',
              touchAction:  'manipulation',
            }}
          >
            {locale === 'bg' ? 'Затвори' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── TabContent ────────────────────────────────────────────────────────

type SectionData = { heading: string; body: string }
type TabData     = { title: string; updated: string; sections: readonly SectionData[] }

function TabContent({ data }: { data: TabData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{
        fontSize:      19,
        fontWeight:    700,
        color:         '#f2f2f2',
        lineHeight:    1.3,
        marginBottom:  4,
        letterSpacing: '-0.01em',
      }}>
        {data.title}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
        {data.updated}
      </div>

      {data.sections.map((s) => (
        <Section key={s.heading} heading={s.heading} body={s.body} />
      ))}
    </div>
  )
}

function Section({ heading, body }: SectionData) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize:     13,
        fontWeight:   700,
        color:        'rgba(255,255,255,0.75)',
        marginBottom: 6,
        letterSpacing: '0.02em',
      }}>
        {heading}
      </div>
      <div style={{
        fontSize:   13.5,
        color:      'rgba(255,255,255,0.55)',
        lineHeight: 1.7,
        whiteSpace: 'pre-line',
      }}>
        {body}
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────

function CloseX() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  )
}
