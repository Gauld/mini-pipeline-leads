import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEmailMode, type EmailMode } from './settings'

/**
 * Carga el modo efectivo de envío (base de datos, con respaldo en el entorno): enviar con una
 * cuenta o simular. `error` solo si la configuración existe pero es inválida. Servidor únicamente.
 */
export async function loadEmailConfig(supabase: SupabaseClient): Promise<EmailMode | { error: string }> {
  const { data: row } = await supabase.from('email_settings').select('*').maybeSingle()

  try {
    return resolveEmailMode(row, process.env, process.env.SETTINGS_ENCRYPTION_KEY)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Configuración de email inválida.' }
  }
}
