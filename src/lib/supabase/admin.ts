import { createClient } from '@supabase/supabase-js'

/**
 * Cliente con service_role: IGNORA RLS. Es la identidad del "sistema" para automatizaciones.
 * Solo servidor y solo rutas protegidas por secreto. Nunca importar desde código de cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.')
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
