import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/logging/log-error'
import { parseRole, type AppRole } from '@/lib/leads/status-permissions'

/**
 * Rol del usuario autenticado (tabla `user_roles`). Cada usuario solo puede leer su propia fila (RLS).
 * Cerrado por defecto: sin fila, rol desconocido o error de lectura => null (sin permisos).
 * Solo servidor.
 */
export async function loadRole(supabase: SupabaseClient, userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    await logError('auth.loadRole', error, { userId })
    return null
  }
  return parseRole(data?.role)
}
