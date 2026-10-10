import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/logging/log-error'
import type { StatusTransition } from '@/lib/leads/status-permissions'

/**
 * Transiciones de estado que puede hacer el rol operator (tabla `status_transitions`).
 * Cerrado por defecto: si la lectura falla devuelve [] (el operador no podría mover nada).
 * Solo servidor.
 */
export async function loadTransitions(supabase: SupabaseClient): Promise<StatusTransition[]> {
  const { data, error } = await supabase.from('status_transitions').select('from_status_id, to_status_id')
  if (error) {
    await logError('auth.loadTransitions', error)
    return []
  }
  return data ?? []
}
