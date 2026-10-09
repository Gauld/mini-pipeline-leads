'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateLeadStatus(
  leadId: string,
  oldStatusId: string,
  newStatusId: string
) {
  if (oldStatusId === newStatusId) return { success: true }

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
    }
  }

  // 1. Actualizar el estado del lead
  const { error: updateError } = await supabase
    .from('leads')
    .update({ status_id: newStatusId })
    .eq('id', leadId)

  if (updateError) {
    return { success: false, error: `Error al actualizar estado: ${updateError.message}` }
  }

  // 2. Registrar en la auditoría
  const { error: historyError } = await supabase.from('lead_history').insert({
    lead_id: leadId,
    action: 'Actualización de estado',
    performed_by: user.email || 'Administrador',
    old_status_id: oldStatusId,
    new_status_id: newStatusId,
  })

  if (historyError) {
    return {
      success: false,
      error: `Estado actualizado, pero falló la auditoría: ${historyError.message}`,
    }
  }

  revalidatePath('/dashboard')
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

  // Consultar registros de auditoría del lead ordenados por fecha descendente
  const { data, error } = await supabase
    .from('lead_history')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: error.message, data: null }
  }

  return { success: true, data }
}