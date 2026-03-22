// ─── Structured logger ────────────────────────────────────────────────
// In production: silenced unless localStorage.debug = 'tesla:*'

const isDev = import.meta.env.DEV

function shouldLog(ns: string): boolean {
  if (isDev) return true
  try {
    const filter = localStorage.getItem('debug') ?? ''
    if (!filter) return false
    return new RegExp(filter.replace(/\*/g, '.*')).test(ns)
  } catch {
    return false
  }
}

function makeLogger(ns: string) {
  const prefix = `[${ns}]`
  return {
    debug: (...a: unknown[]) => { if (shouldLog(ns)) console.debug(prefix, ...a) },
    info:  (...a: unknown[]) => { if (shouldLog(ns)) console.info(prefix, ...a) },
    warn:  (...a: unknown[]) => { if (shouldLog(ns)) console.warn(prefix, ...a) },
    error: (...a: unknown[]) => { console.error(prefix, ...a) }, // errors always show
  }
}

type Fn = (...a: unknown[]) => void
type Logger = { debug: Fn; info: Fn; warn: Fn; error: Fn }

// One logger per concern — keeps DevTools filtering clean
export const logger: Record<string, Logger> = {
  app:    makeLogger('tesla:app'),
  map:    makeLogger('tesla:map'),
  follow: makeLogger('tesla:follow'),
  gps:    makeLogger('tesla:gps'),
  audio:  makeLogger('tesla:audio'),
  ev:     makeLogger('tesla:ev'),
  events: makeLogger('tesla:events'),
  route:  makeLogger('tesla:route'),
  search: makeLogger('tesla:search'),
}
