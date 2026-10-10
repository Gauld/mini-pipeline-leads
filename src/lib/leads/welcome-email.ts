import type { OutgoingEmail, SmtpConfig } from '../email/send-email'
import type { EmailMode } from '../email/settings'
import { logError } from '../logging/log-error'
import { renderTemplate } from './render-template'

export interface WelcomeLead {
  id: string
  full_name: string
  email: string
  target_opposition: string
}

export interface WelcomeTemplate {
  subject: string
  body: string
}

/** Dependencias inyectadas: la lógica no conoce Supabase ni nodemailer. */
export interface WelcomeDeps {
  /** Reserva el lead de forma atómica; null si no existe o ya fue reservado/enviado. */
  claimLead(leadId: string): Promise<WelcomeLead | null>
  /** Deshace la reserva para que un reintento pueda volver a enviarlo. */
  releaseLead(leadId: string): Promise<void>
  loadTemplate(): Promise<WelcomeTemplate | null>
  loadConfig(): Promise<EmailMode | { error: string }>
  send(email: OutgoingEmail, config: SmtpConfig): Promise<{ success: true } | { success: false; error: string }>
  /** Deja constancia en el historial del lead (asunto y cuerpo EXACTOS enviados). Solo tras un envío exitoso. */
  logSent(leadId: string, subject: string, body: string): Promise<void>
  /** Deja constancia en el historial de que el envío FALLÓ, con el error (asunto y cuerpo que se intentaron enviar). */
  logFailed(leadId: string, subject: string, body: string, error: string): Promise<void>
}

export type WelcomeResult =
  | { status: 'sent' }
  /** Modo simulación: se registró como enviado, pero no salió ningún correo. */
  | { status: 'simulated' }
  | { status: 'skipped' }
  | { status: 'error'; error: string }

export function buildWelcomeEmail(template: WelcomeTemplate, lead: WelcomeLead): OutgoingEmail {
  const vars = { nombre: lead.full_name, oposicion: lead.target_opposition }
  return {
    to: lead.email,
    subject: renderTemplate(template.subject, vars),
    text: renderTemplate(template.body, vars),
  }
}

/**
 * Envía el email de bienvenida (plantilla del estado "Nuevo") a un lead recién registrado.
 * - Modo simulación: no envía, pero lo registra como enviado.
 * - Si el envío falla: lo registra en el historial con el error y libera el lead para reintentar.
 * Reserva primero y libera ante cualquier fallo: el lead queda pendiente y se puede reintentar.
 */
export async function processWelcomeEmail(deps: WelcomeDeps, leadId: string): Promise<WelcomeResult> {
  const lead = await deps.claimLead(leadId)
  if (!lead) return { status: 'skipped' }

  // Sin plantilla no hay asunto que registrar: solo se libera.
  const release = async (error: string): Promise<WelcomeResult> => {
    await deps.releaseLead(leadId)
    return { status: 'error', error }
  }

  let email: OutgoingEmail
  try {
    const template = await deps.loadTemplate()
    if (!template) return await release('No hay plantilla para el estado "Nuevo".')
    email = buildWelcomeEmail(template, lead)
  } catch (err) {
    return await release(err instanceof Error ? err.message : 'Error desconocido')
  }

  // Un fallo de envío queda en el historial con su error; si el propio registro falla, no se pierde el original.
  const fail = async (error: string): Promise<WelcomeResult> => {
    try {
      await deps.logFailed(leadId, email.subject, email.text, error)
    } catch (err) {
      await logError('welcomeEmail.historyFailed', err, { leadId })
    }
    return release(error)
  }

  let simulated = false
  try {
    const loaded = await deps.loadConfig()
    if ('error' in loaded) return await fail(loaded.error)

    if (loaded.mode === 'simulate') {
      simulated = true
    } else {
      const sent = await deps.send(email, loaded.config)
      if (!sent.success) return await fail(sent.error)
    }
  } catch (err) {
    return await fail(err instanceof Error ? err.message : 'Error desconocido')
  }

  // El email ya salió (o se simuló): un fallo del historial NO libera el lead (se reenviaría el correo).
  try {
    await deps.logSent(leadId, email.subject, email.text)
  } catch (err) {
    await logError('welcomeEmail.history', err, { leadId })
  }
  return { status: simulated ? 'simulated' : 'sent' }
}
