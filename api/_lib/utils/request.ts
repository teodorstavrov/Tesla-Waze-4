// ─── HTTP utilities ────────────────────────────────────────────────────

/**
 * fetch() with a hard timeout via AbortController.
 * Properly cancels the in-flight request (frees sockets) on timeout.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch + parse JSON with full error surfacing.
 * Throws with a descriptive message on HTTP error or parse failure.
 */
export async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  const res = await fetchWithTimeout(url, options, timeoutMs)

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`)
  }

  try {
    return (await res.json()) as T
  } catch (err) {
    throw new Error(`JSON parse error from ${url}: ${String(err)}`)
  }
}

/** Format a provider error into a short string for the meta object */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'timeout'
    return err.message.slice(0, 120)
  }
  return String(err).slice(0, 120)
}
