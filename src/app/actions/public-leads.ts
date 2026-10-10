'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { parseLead } from '@/lib/leads/lead-schema'
import { CONSENT_TEXT_VERSION } from '@/lib/leads/consent'
import { verifyTurnstile } from '@/lib/security/turnstile'
import { clientIpFrom, hashKey, isRateLimitBypassed, withinRateLimit } from '@/lib/security/rate-limit'
import { logError } from '@/lib/logging/log-error'

// Límites antiabuso.
const IP_MAX_PER_HOUR = 5
const EMAIL_MAX_PER_DAY = 3
const GENERIC_ERROR = 'No pudimos registrar tu solicitud. Inténtalo de nuevo en unos minutos.'
const TOO_MANY = 'Has hecho demasiados intentos. Inténtalo de nuevo más tarde.'

export async function createLead(formData: FormData) {
  // 0. Honeypot: campo oculto que un humano no rellena. Se responde "éxito" para que el bot no aprenda.
  if (String(formData.get('website') ?? '').trim() !== '') {
    return { success: true }
  }

  const ip = clientIpFrom(await headers())

  // 1. Anti-bot (Cloudflare Turnstile), verificado en servidor.
  const human = await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? ''), {
    secret: process.env.TURNSTILE_SECRET_KEY,
    ip,
  })
  if (!human.success) {
    return { success: false, error: human.error }
  }

  // 2. Rate limit por IP y por email (contadores en Postgres, claves hasheadas).
  const salt = process.env.RATE_LIMIT_SALT ?? (process.env.NODE_ENV === 'production' ? undefined : 'dev-salt')
  if (!salt) {
    await logError('createLead.config', 'Falta RATE_LIMIT_SALT en el servidor.')
    return { success: false, error: GENERIC_ERROR }
  }
  const rawEmail = String(formData.get('email') ?? '')
  try {
    const admin = createAdminClient()

    // Modo revisión técnica (Panel > Configuración de email). Si no se puede leer el ajuste,
    // se mantiene el límite: cerrado por defecto.
    const { data: settings, error: settingsError } = await admin
      .from('email_settings')
      .select('bypass_rate_limit')
      .maybeSingle()
    if (settingsError) await logError('createLead.bypassSetting', settingsError)

    if (!isRateLimitBypassed(settings)) {
      const okIp = await withinRateLimit(admin, hashKey('ip', ip, salt), IP_MAX_PER_HOUR, 3600)
      const okEmail = rawEmail.trim()
        ? await withinRateLimit(admin, hashKey('email', rawEmail, salt), EMAIL_MAX_PER_DAY, 86400)
        : true
      if (!okIp || !okEmail) return { success: false, error: TOO_MANY }
    }
  } catch (err) {
    await logError('createLead.rateLimit', err)
    return { success: false, error: GENERIC_ERROR }
  }

  const supabase = await createClient()

  // 3. Estado inicial (posición 1) y catálogo de oposiciones activas contra el que se valida.
  const [{ data: initialStatus, error: statusError }, { data: oppositions, error: catalogError }] =
    await Promise.all([
      supabase.from('lead_statuses').select('id').eq('position', 1).single(),
      supabase.from('target_oppositions').select('name').eq('is_active', true),
    ])

  if (statusError || !initialStatus || catalogError) {
    await logError('createLead.catalog', statusError ?? catalogError ?? 'Catálogo de estados vacío')
    return { success: false, error: GENERIC_ERROR }
  }

  // 4. Validar y normalizar en servidor: el `required`/`type="email"`
  // del navegador no protege un POST directo a la Server Action.
  const parsed = parseLead(
    Object.fromEntries(formData),
    (oppositions ?? []).map((o) => o.name)
  )
  if (!parsed.success) {
    return {
      success: false,
      error: Object.values(parsed.fieldErrors).flat()[0] ?? 'Revisa los datos del formulario.',
    }
  }

  // 5. Registrar el lead. La auditoría inicial la escribe el trigger
  // trg_lead_created (supabase/schema.sql). Sin .select(): anon no puede leer leads.
  // La hora del consentimiento la pone el servidor, nunca el cliente.
  const now = new Date().toISOString()
  const { error: leadError } = await supabase.from('leads').insert({
    ...parsed.data,
    status_id: initialStatus.id,
    consent_privacy_at: now,
    consent_at: parsed.data.consent_marketing ? now : null,
    consent_text_version: CONSENT_TEXT_VERSION,
  })

  // 23505 = combinación (email, oposición) ya registrada (índice único). No se crea nada ni se
  // reenvía correo; se avisa de que la solicitud ya está en revisión.
  if (leadError?.code === '23505') {
    return { success: true, alreadyRegistered: true }
  }

  if (leadError) {
    // Mensaje genérico al público; el detalle (constraints, RLS) solo se loguea.
    await logError('createLead.insert', leadError)
    return { success: false, error: GENERIC_ERROR }
  }

  revalidatePath('/dashboard')
  return { success: true }
}