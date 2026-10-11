'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email/send-email'
import { loadEmailConfig } from '@/lib/email/load-config'
import { interpretStatusUpdate, parseStatusChange } from '@/lib/leads/status-change'
import { canChangeStatus, canConfigureEmail, canManageEmail, canViewLeads } from '@/lib/leads/status-permissions'
import { loadRole } from '@/lib/auth/load-role'
import { loadTransitions } from '@/lib/auth/load-transitions'

const NO_PERMISSION = 'No tienes permiso para esta acción.'
import { logError } from '@/lib/logging/log-error'

export async function updateLeadStatus(
  leadId: string,
  oldStatusId: string,
  newStatusId: string
) {
  const parsed = parseStatusChange(leadId, oldStatusId, newStatusId)
  if (!parsed.ok) return { success: false, error: parsed.error, conflict: false }
  if ('noop' in parsed) return { success: true }

  const supabase = await createClient()

  // 🔒 Verificación de sesión
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      error: 'No autorizado: Debes iniciar sesión como administrador.',
      conflict: false,
    }
  }

  // Permisos por rol (admin: cualquier estado; operador: solo las transiciones definidas). El trigger
  // enforce_status_transition aplica la misma regla en la base; esto da un mensaje claro.
  const [role, transitions, { data: statuses, error: statusesError }] = await Promise.all([
    loadRole(supabase, user.id),
    loadTransitions(supabase),
    supabase.from('lead_statuses').select('id'),
  ])
  if (statusesError) {
    await logError('dashboard.updateLeadStatus.statuses', statusesError)
    return { success: false, error: 'No se pudo actualizar el estado.', conflict: false }
  }
  if (
    !canChangeStatus(role, parsed.change.oldStatusId, parsed.change.newStatusId, statuses ?? [], transitions)
  ) {
    return { success: false, error: 'No tienes permiso para este cambio de estado.', conflict: false }
  }

  // Concurrencia optimista: solo se cambia si el estado sigue siendo el
  // que el administrador veía (.eq('status_id', old)), y .select('id') devuelve las filas
  // afectadas. Sin eso, un UPDATE que no toca nada (lead borrado, RLS, otro admin) se
  // reportaría como éxito. El historial lo escribe el trigger trg_lead_status_change.
  const { change } = parsed
  const { data, error } = await supabase
    .from('leads')
    .update({ status_id: change.newStatusId })
    .eq('id', change.leadId)
    .eq('status_id', change.oldStatusId)
    .select('id')

  if (error) await logError('dashboard.updateLeadStatus', error, { leadId: change.leadId })

  const result = interpretStatusUpdate({ error, rows: data })

  // Con conflicto también se revalida: la lista debe mostrar el estado real del lead.
  revalidatePath('/dashboard')
  return result
}

const MAX_SUBJECT = 200
const MAX_BODY = 5000

function validateEmailContent(subject: string, body: string): string | null {
  if (!subject.trim() || !body.trim()) return 'Asunto y mensaje son obligatorios.'
  if (subject.length > MAX_SUBJECT) return `El asunto no puede superar ${MAX_SUBJECT} caracteres.`
  if (body.length > MAX_BODY) return `El mensaje no puede superar ${MAX_BODY} caracteres.`
  return null
}

export async function sendFollowUpEmail(leadId: string, subject: string, body: string) {
  const invalid = validateEmailContent(subject, body)
  if (invalid) return { success: false, error: invalid }

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

  // El destinatario se lee en el servidor: nunca se confía en un email enviado por el cliente.
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('email')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    if (leadError) await logError('dashboard.sendFollowUpEmail.loadLead', leadError, { leadId })
    return { success: false, error: 'Lead no encontrado.' }
  }

  // El seguimiento responde a una solicitud que el propio lead hizo: no es una comunicación
  // comercial no solicitada y no exige consent_marketing (ver D27). Debe limitarse a lo que pidió.

  // Modo envío: primero se envía y solo con éxito se registra como enviado. Un fallo queda en el
  // historial con su error (el historial no miente). Modo simulación: se registra sin enviar.
  const recordFailure = async (error: string) => {
    const { error: historyError } = await supabase.rpc('log_followup_email', {
      p_lead_id: leadId,
      p_subject: subject,
      p_body: body,
      p_error: error,
    })
    if (historyError) await logError('dashboard.sendFollowUpEmail.historyFailed', historyError, { leadId })
  }

  const loaded = await loadEmailConfig(supabase)
  if ('error' in loaded) {
    await logError('dashboard.sendFollowUpEmail.config', loaded.error, { leadId })
    await recordFailure(loaded.error)
    return { success: false, error: loaded.error }
  }

  if (loaded.mode === 'send') {
    const sent = await sendEmail({ to: lead.email, subject, text: body }, loaded.config)
    if (!sent.success) {
      await logError('dashboard.sendFollowUpEmail.send', sent.error, { leadId })
      await recordFailure(sent.error)
      return { success: false, error: `No se pudo enviar el email: ${sent.error}` }
    }
  }

  const { error } = await supabase.rpc('log_followup_email', {
    p_lead_id: leadId,
    p_subject: subject,
    p_body: body,
  })

  if (error) {
    await logError('dashboard.sendFollowUpEmail.history', error, { leadId })
    return { success: false, error: `No se pudo registrar el email: ${error.message}` }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function saveEmailTemplate(statusId: string, subject: string, body: string) {
  const invalid = validateEmailContent(subject, body)
  if (invalid) return { success: false, error: invalid }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'No autorizado: Debes iniciar sesión como administrador.' }
  }

  if (!canConfigureEmail(await loadRole(supabase, user.id))) {
    return { success: false, error: NO_PERMISSION }
  }

  const { error } = await supabase
    .from('email_templates')
    .upsert(
      { status_id: statusId, subject, body, updated_at: new Date().toISOString() },
      { onConflict: 'status_id' }
    )

  if (error) {
    await logError('dashboard.saveEmailTemplate', error, { statusId })
    return { success: false, error: `No se pudo guardar la plantilla: ${error.message}` }
  }

  revalidatePath('/dashboard', 'layout')
  return { success: true }
}

export async function getLeadHistory(leadId: string) {
  const supabase = await createClient()

  // 🔒 Verificación de sesión
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      error: 'No autorizado: Debes iniciar sesión para consultar el historial.',
      data: null,
    }
  }

  if (!canViewLeads(await loadRole(supabase, user.id))) {
    return { success: false, error: NO_PERMISSION, data: null }
  }

  // Consultar registros de auditoría del lead ordenados por fecha descendente
  const { data, error } = await supabase
    .from('lead_history')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    await logError('dashboard.getLeadHistory', error, { leadId })
    return { success: false, error: error.message, data: null }
  }

  return { success: true, data }
}