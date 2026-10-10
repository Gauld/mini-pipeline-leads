const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

interface VerifyOptions {
  secret: string | undefined
  ip?: string
  fetcher?: Fetcher
  production?: boolean
}

export type TurnstileResult = { success: true } | { success: false; error: string }

/**
 * Verifica el token del widget contra Cloudflare (servidor únicamente).
 * Cerrado por defecto: en producción, sin secreto o sin token, se rechaza.
 * En desarrollo sin secreto se omite para poder probar en local.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  {
    secret,
    ip,
    fetcher = fetch,
    production = process.env.NODE_ENV === 'production',
  }: VerifyOptions
): Promise<TurnstileResult> {
  if (!secret) {
    return production ? { success: false, error: 'Verificación anti-bot no configurada.' } : { success: true }
  }
  if (!token || !token.trim()) {
    return { success: false, error: 'Completa la verificación anti-bot.' }
  }

  const body = new URLSearchParams({ secret, response: token })
  if (ip && ip !== 'unknown') body.set('remoteip', ip)

  try {
    const res = await fetcher(VERIFY_URL, { method: 'POST', body })
    if (!res.ok) return { success: false, error: 'No se pudo verificar el anti-bot.' }
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
      ? { success: true }
      : { success: false, error: 'Verificación anti-bot fallida. Inténtalo de nuevo.' }
  } catch {
    return { success: false, error: 'No se pudo verificar el anti-bot.' }
  }
}
