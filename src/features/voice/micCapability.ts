// ── TeslaBrowserAudioCapability ─────────────────────────────────────────
// Isolated microphone / audio capability layer.
// All browser-specific checks, error mapping and Tesla quirks live here.
// React components import from here — no direct browser API calls elsewhere.

export type MicErrorType =
  | 'not-secure-context'  // isSecureContext === false
  | 'api-unavailable'     // navigator.mediaDevices or getUserMedia missing
  | 'not-allowed'         // user or OS denied; Permissions-Policy blocks
  | 'not-found'           // no microphone hardware detected
  | 'not-readable'        // mic in use by another process
  | 'security'            // generic SecurityError
  | 'abort'               // hardware/OS aborted the request
  | 'unknown'

export interface MicDiagnostics {
  isSecureContext:             boolean
  protocol:                    string
  hostname:                    string
  userAgent:                   string
  hasMediaDevices:             boolean
  hasGetUserMedia:             boolean
  hasMediaRecorder:            boolean
  hasSpeechRecognition:        boolean
  hasWebkitSpeechRecognition:  boolean
  permissionState:             PermissionState | 'api-unavailable' | 'unknown'
  streamCreated:               boolean | null   // null = not yet tested
  streamError:                 string | null
  audioContextState:           AudioContextState | 'unavailable' | 'error'
  supportedMimeType:           string | null
}

// ── Capability checks ─────────────────────────────────────────────────────

/** Whether getUserMedia is available at all in this environment */
export function isMicrophoneSupported(): boolean {
  return !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia)
}

/** Whether either flavour of SpeechRecognition exists */
export function isSpeechRecognitionSupported(): boolean {
  const w = window as Record<string, unknown>
  return !!(w['SpeechRecognition'] ?? w['webkitSpeechRecognition'])
}

/** Best audio/mime type for MediaRecorder in the current browser */
export function getBestMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'audio/webm;codecs=opus',   // Chrome / Tesla browser
    'audio/webm',
    'audio/ogg;codecs=opus',    // Firefox
    'audio/mp4',                // Safari / iOS
  ]
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch { /* ignore */ }
  }
  return null  // let browser choose default
}

// ── Core API ──────────────────────────────────────────────────────────────

/**
 * Request microphone access.
 * MUST be called synchronously inside a real user-gesture event handler.
 * Throws DOMException on denial — caller maps via getMicErrorType().
 */
export async function requestMicrophone(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new DOMException('Not a secure context — HTTPS required', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('getUserMedia not available in this browser', 'NotSupportedError')
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation:  true,
      noiseSuppression:  true,
      autoGainControl:   true,
      channelCount:      1,
    },
    video: false,
  })
}

/** Stop all tracks on a MediaStream and release the hardware */
export function releaseMicrophone(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop())
}

// ── Error mapping ─────────────────────────────────────────────────────────

export function getMicErrorType(err: unknown): MicErrorType {
  if (!window.isSecureContext)               return 'not-secure-context'
  if (!navigator.mediaDevices?.getUserMedia) return 'api-unavailable'
  if (!(err instanceof Error))               return 'unknown'
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': return 'not-allowed'
    case 'NotFoundError':
    case 'DevicesNotFoundError':  return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':       return 'not-readable'
    case 'SecurityError':         return 'security'
    case 'AbortError':            return 'abort'
    default:                      return 'unknown'
  }
}

/** Localised human-readable message for each error type */
export function getMicErrorMessage(type: MicErrorType, lang = 'bg'): string {
  const bg = lang === 'bg'
  switch (type) {
    case 'not-secure-context':
      return bg
        ? 'Микрофонът изисква HTTPS. Сайтът не е зареден по сигурен канал.'
        : 'Microphone requires HTTPS. The page is not loaded over a secure connection.'
    case 'api-unavailable':
      return bg
        ? 'Браузърът не поддържа достъп до микрофон (getUserMedia липсва).'
        : 'This browser does not support microphone access (getUserMedia missing).'
    case 'not-allowed':
      return bg
        ? 'TesRadar няма достъп до микрофона. Провери разрешенията на браузъра за tesradar.tech.'
        : 'TesRadar has no microphone access. Check browser permissions for tesradar.tech.'
    case 'not-found':
      return bg
        ? 'Микрофон не е намерен. Устройството може да няма микрофон.'
        : 'No microphone found. The device may not have a microphone.'
    case 'not-readable':
      return bg
        ? 'Микрофонът се използва от друго приложение.'
        : 'Microphone is currently in use by another application.'
    case 'security':
      return bg
        ? 'Браузърът е блокирал достъпа по сигурностни причини (Permissions-Policy).'
        : 'Browser blocked microphone access for security reasons (Permissions-Policy).'
    case 'abort':
      return bg
        ? 'Достъпът до микрофона е прекъснат от системата.'
        : 'Microphone access was aborted by the system.'
    default:
      return bg
        ? 'Неочаквана грешка при достъп до микрофона.'
        : 'Unexpected error accessing the microphone.'
  }
}

// ── Full diagnostics ───────────────────────────────────────────────────────
// Safe to call at any time — never throws.

export async function getMicrophoneDiagnostics(): Promise<MicDiagnostics> {
  const w = window as Record<string, unknown>

  const d: MicDiagnostics = {
    isSecureContext:             window.isSecureContext,
    protocol:                    location.protocol,
    hostname:                    location.hostname,
    userAgent:                   navigator.userAgent,
    hasMediaDevices:             'mediaDevices' in navigator,
    hasGetUserMedia:             !!(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder:            typeof MediaRecorder !== 'undefined',
    hasSpeechRecognition:        typeof w['SpeechRecognition'] !== 'undefined',
    hasWebkitSpeechRecognition:  typeof w['webkitSpeechRecognition'] !== 'undefined',
    permissionState:             'unknown',
    streamCreated:               null,
    streamError:                 null,
    audioContextState:           'unavailable',
    supportedMimeType:           null,
  }

  // Permission API query
  try {
    const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    d.permissionState = perm.state
  } catch {
    d.permissionState = 'api-unavailable'
  }

  // AudioContext
  try {
    type AC = typeof AudioContext
    const ACtx = (window.AudioContext ?? w['webkitAudioContext']) as AC | undefined
    if (ACtx) {
      const ctx = new ACtx()
      d.audioContextState = ctx.state
      await ctx.close()
    }
  } catch { d.audioContextState = 'error' as AudioContextState }

  // Best MediaRecorder mime type
  if (d.hasMediaRecorder) {
    d.supportedMimeType = getBestMimeType()
  }

  return d
}

/**
 * Full diagnostic including an actual getUserMedia call.
 * Must be called inside a user gesture for the stream test to work.
 */
export async function runMicTest(): Promise<MicDiagnostics> {
  const d = await getMicrophoneDiagnostics()

  if (d.hasGetUserMedia) {
    try {
      const stream = await requestMicrophone()
      d.streamCreated = true
      releaseMicrophone(stream)
    } catch (err) {
      d.streamCreated = false
      d.streamError = err instanceof Error
        ? `${err.name}: ${err.message}`
        : String(err)
    }
  } else {
    d.streamCreated = false
    d.streamError = 'getUserMedia not available'
  }

  // Log full diagnostics for developer inspection
  console.group('[TesRadar] Mic Diagnostics')
  console.log('Secure context:  ', d.isSecureContext)
  console.log('Protocol:        ', d.protocol)
  console.log('Hostname:        ', d.hostname)
  console.log('User-Agent:      ', d.userAgent)
  console.log('mediaDevices:    ', d.hasMediaDevices)
  console.log('getUserMedia:    ', d.hasGetUserMedia)
  console.log('MediaRecorder:   ', d.hasMediaRecorder)
  console.log('SpeechRecog:     ', d.hasSpeechRecognition)
  console.log('webkitSpeechRec: ', d.hasWebkitSpeechRecognition)
  console.log('Permission state:', d.permissionState)
  console.log('Stream created:  ', d.streamCreated)
  console.log('Stream error:    ', d.streamError)
  console.log('AudioContext:    ', d.audioContextState)
  console.log('MimeType:        ', d.supportedMimeType)
  console.groupEnd()

  return d
}
