'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { encryptSecret } from '@/lib/security/secret-box'
import { buildTestEmail, validateEmailSettings } from '@/lib/email/settings'
import { loadEmailConfig } from '@/lib/email/load-config'
import { sendEmail } from '@/lib/email/send-email'
import { allowInternalSmtp, resolveSafeSmtpTarget } from '@/lib/security/safe-smtp-target'
import { logError } from '@/lib/logging/log-error'
import { canManageEmail } from '@/lib/leads/status-permissions'
import { loadRole } from '@/lib/auth/load-role'

const NO_PERMISSION = 'No tienes permiso para esta acción.'
const TEST_RECIPIENT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Envía un email de prueba con la configuración GUARDADA al destinatario indicado por el admin. */
export async function sendTestEmail(to: string) {
  const recipient = to.trim()
  if (!TEST_RECIPIENT.test(recipient) || recipient.length > 255) {
    return { success: false, error: 'Indica un email de destino válido.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'No autorizado: Debes iniciar sesión como administrador.' }
  }

  if (!canManageEmail(await loadRole(supabase, user.id))) {
    return { success: false, error: NO_PERMISSION }
  }

  const loaded = await loadEmailConfig(supabase)
  if ('error' in loaded) {
    await logError('dashboard.sendTestEmail.config', loaded.error)
    return { success: false, error: loaded.error }
  }

  if (loaded.mode === 'simulate') {
    return {
      success: false,
      error: 'El modo simulación está activo: no se envía ningún correo. Desactívalo y guarda para probar.',
    }
  }

  const sent = await sendEmail(buildTestEmail(recipient), loaded.config)
  if (!sent.success) {
    await logError('dashboard.sendTestEmail.send', sent.error)
    return { success: false, error: `No se pudo enviar: ${sent.error}` }
  }

  return { success: true, sentTo: recipient }
}

interface SaveEmailSettingsInput {
  host: string
  port: string
  user: string
  password: string // vacío = conservar la guardada
  fromAddress: string
  fromName: string
  simulateSending: boolean
  bypassRateLimit: boolean
}

export async function saveEmailSettings(input: SaveEmailSettingsInput) {
  const validation = validateEmailSettings(input)
  if (!validation.ok) return { success: false, error: validation.error }
  const { host, port, user, fromAddress, fromName } = validation.value

  const supabase = await createClient()

  const {
    data: { user: admin },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !admin) {
    return { success: false, error: 'No autorizado: Debes iniciar sesión como administrador.' }
  }

  if (!canManageEmail(await loadRole(supabase, admin.id))) {
    return { success: false, error: NO_PERMISSION }
  }

  // Anti-SSRF: el servidor abrirá conexiones a este host; solo puertos SMTP e IPs públicas.
  const target = await resolveSafeSmtpTarget(host, port, { allowInternal: allowInternalSmtp() })
  if (!target.ok) return { success: false, error: target.error }

  const row = {
    id: true,
    smtp_host: host,
    smtp_port: port,
    smtp_user: user,
    from_address: fromAddress,
    from_name: fromName || null,
    updated_at: new Date().toISOString(),
    updated_by: admin.email ?? null,
    simulate_sending: input.simulateSending === true,
    bypass_rate_limit: input.bypassRateLimit === true,
  }

  if (input.password) {
    const key = process.env.SETTINGS_ENCRYPTION_KEY
    if (!key) {
      await logError('dashboard.saveEmailSettings.config', 'Falta SETTINGS_ENCRYPTION_KEY en el servidor.')
      return { success: false, error: 'Falta SETTINGS_ENCRYPTION_KEY en el servidor.' }
    }
    let encrypted: string
    try {
      encrypted = encryptSecret(input.password, key)
    } catch (err) {
      await logError('dashboard.saveEmailSettings.encrypt', err)
      return { success: false, error: err instanceof Error ? err.message : 'No se pudo cifrar.' }
    }

    const { error } = await supabase
      .from('email_settings')
      .upsert({ ...row, smtp_password_encrypted: encrypted }, { onConflict: 'id' })
    if (error) {
      await logError('dashboard.saveEmailSettings.upsert', error)
      return { success: false, error: `No se pudo guardar: ${error.message}` }
    }
  } else {
    // Sin contraseña nueva: solo se actualiza una configuración ya existente.
    const { data, error } = await supabase
      .from('email_settings')
      .update(row)
      .eq('id', true)
      .select('id')
    if (error) {
      await logError('dashboard.saveEmailSettings.update', error)
      return { success: false, error: `No se pudo guardar: ${error.message}` }
    }
    if (!data || data.length === 0) {
      return { success: false, error: 'La contraseña es obligatoria la primera vez.' }
    }
  }

  revalidatePath('/dashboard/configuracion')
  return { success: true }
}
