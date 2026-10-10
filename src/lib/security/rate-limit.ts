import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/logging/log-error'

/**
 * Clave anónima para contar: la IP y el email son datos personales, así que solo
 * se guarda un hash con sal (RATE_LIMIT_SALT). Sirve para contar, no para identificar.
 */
export function hashKey(namespace: 'ip' | 'email', value: string, salt: string): string {
  const digest = createHash('sha256').update(`${salt}:${value.trim().toLowerCase()}`).digest('hex')
  return `${namespace}:${digest}`
}

/**
 * IP del cliente. Se toma la última de x-forwarded-for (la añade la plataforma);
 * la primera la puede falsificar el cliente.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const last = forwarded.split(',').pop()?.trim()
    if (last) return last
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * ¿La configuración pide ignorar el límite de envíos? (modo de revisión técnica).
 * Cerrado por defecto: cualquier valor distinto de `true` mantiene el límite.
 */
export function isRateLimitBypassed(
  settings: { bypass_rate_limit?: boolean | null } | null | undefined
): boolean {
  return settings?.bypass_rate_limit === true
}

/**
 * Cuenta un intento en la ventana y dice si sigue dentro del límite.
 * Cerrado por defecto: si el contador falla, se deniega.
 */
export async function withinRateLimit(
  supabase: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    await logError('rateLimit.rpc', error)
    return false
  }
  return data === true
}
