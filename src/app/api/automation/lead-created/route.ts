import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logging/log-error'
import { isValidAutomationSecret } from '@/lib/security/automation-auth'
import { loadEmailConfig } from '@/lib/email/load-config'
import { sendEmail } from '@/lib/email/send-email'
import { processWelcomeEmail, type WelcomeLead, type WelcomeTemplate } from '@/lib/leads/welcome-email'

const DEFAULT_DAILY_CAP = 200

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Llamado por el trigger de la base de datos (pg_net) al registrarse un lead.
 * Autenticado por secreto compartido; actúa como "sistema" (service_role).
 */
export async function POST(request: Request) {
  if (!isValidAutomationSecret(request.headers.get('x-automation-secret'), process.env.AUTOMATION_SECRET)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  let leadId: unknown
  try {
    leadId = ((await request.json()) as { lead_id?: unknown }).lead_id
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (typeof leadId !== 'string' || !UUID.test(leadId)) {
    return Response.json({ error: 'lead_id inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fusible: tope diario de correos de bienvenida. Superado, el lead
  // queda pendiente (welcome_email_sent_at null) y se barre a mano. Cerrado por defecto.
  const cap = Number.parseInt(process.env.WELCOME_EMAIL_DAILY_CAP ?? '', 10) || DEFAULT_DAILY_CAP
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count, error: countError } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('welcome_email_sent_at', startOfDay.toISOString())
  if (countError) {
    await logError('welcomeEmail.dailyCap', countError)
    return Response.json({ status: 'error' }, { status: 500 })
  }
  if ((count ?? 0) >= cap) {
    console.warn('[welcome-email] tope diario alcanzado', cap)
    return Response.json({ status: 'throttled' })
  }

  const result = await processWelcomeEmail(
    {
      async claimLead(id) {
        // Atómico: solo uno gana si hay reintentos o llamadas duplicadas.
        const { data } = await supabase
          .from('leads')
          .update({ welcome_email_sent_at: new Date().toISOString() })
          .eq('id', id)
          .is('welcome_email_sent_at', null)
          .select('id, full_name, email, target_opposition')
          .maybeSingle()
        return (data as WelcomeLead | null) ?? null
      },
      async releaseLead(id) {
        await supabase.from('leads').update({ welcome_email_sent_at: null }).eq('id', id)
      },
      async loadTemplate() {
        const { data: status } = await supabase
          .from('lead_statuses')
          .select('id')
          .eq('position', 1)
          .single()
        if (!status) return null
        const { data } = await supabase
          .from('email_templates')
          .select('subject, body')
          .eq('status_id', status.id)
          .maybeSingle()
        return (data as WelcomeTemplate | null) ?? null
      },
      loadConfig: () => loadEmailConfig(supabase),
      send: sendEmail,
      async logSent(id, subject, body) {
        const { error } = await supabase.from('lead_history').insert({
          lead_id: id,
          action: `Email de bienvenida enviado: ${subject.slice(0, 200)}`,
          performed_by: 'Sistema (Automatización)',
          email_subject: subject,
          email_body: body,
        })
        if (error) throw new Error(error.message)
      },
      async logFailed(id, subject, body, error) {
        const { error: dbError } = await supabase.from('lead_history').insert({
          lead_id: id,
          action: `Email de bienvenida NO enviado: ${subject.slice(0, 200)} — ${error.slice(0, 300)}`,
          performed_by: 'Sistema (Automatización)',
          email_subject: subject,
          email_body: body,
        })
        if (dbError) throw new Error(dbError.message)
      },
    },
    leadId
  )

  if (result.status === 'error') {
    await logError('welcomeEmail.send', result.error, { leadId })
    return Response.json({ status: 'error' }, { status: 500 })
  }
  return Response.json({ status: result.status })
}
