'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createLead(formData: FormData) {
  const supabase = await createClient()

  // 1. Obtener estado inicial (posición 1)
  const { data: initialStatus, error: statusError } = await supabase
    .from('lead_statuses')
    .select('id')
    .eq('position', 1)
    .single()

  if (statusError || !initialStatus) {
    return { success: false, error: 'No se pudo obtener el estado inicial del pipeline.' }
  }

  // 2. Extraer y validar datos del formulario
  const full_name = formData.get('full_name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  let target_opposition = formData.get('target_opposition') as string
  const other_target_opposition = formData.get('other_target_opposition') as string

  if (target_opposition === 'Otros') {
    if (!other_target_opposition || !other_target_opposition.trim()) {
      return { success: false, error: 'Por favor, especifica la oposición de tu interés.' }
    }
    target_opposition = `Otros: ${other_target_opposition.trim()}`
  }

  if (!full_name || !email || !phone || !target_opposition) {
    return { success: false, error: 'Todos los campos son obligatorios.' }
  }

  // 3. Registrar el lead
  const { data: newLead, error: leadError } = await supabase
    .from('leads')
    .insert({
      full_name,
      email,
      phone,
      target_opposition,
      status_id: initialStatus.id,
    })
    .select()
    .single()

  if (leadError) {
    return { success: false, error: leadError.message }
  }

  // 4. Auditoría inicial del lead
  await supabase.from('lead_history').insert({
    lead_id: newLead.id,
    action: 'Lead registrado en el formulario público',
    performed_by: 'Sistema (Formulario Público)',
    new_status_id: initialStatus.id,
  })

  revalidatePath('/dashboard')
  return { success: true }
}