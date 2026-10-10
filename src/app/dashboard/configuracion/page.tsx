import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { logError } from '@/lib/logging/log-error'
import { canManageEmail } from '@/lib/leads/status-permissions'
import { loadRole } from '@/lib/auth/load-role'
import EmailSettingsForm from './EmailSettingsForm'

export const instant = false

export default async function SettingsPage() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  if (!canManageEmail(await loadRole(supabase, user.id))) {
    redirect('/dashboard')
  }

  // Se piden columnas explícitas: la contraseña cifrada nunca llega al cliente.
  const { data: settings, error } = await supabase
    .from('email_settings')
    .select('smtp_host, smtp_port, smtp_user, from_address, from_name, simulate_sending, bypass_rate_limit, updated_at, updated_by')
    .maybeSingle()

  if (error) await logError('dashboard.configuracion.query', error)

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Configuración de email</h1>
            <p className="text-sm text-slate-500">
              Cuenta SMTP que envía los emails de seguimiento.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ← Volver al panel
          </Link>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            No se pudo cargar la configuración: {error.message}. ¿Ejecutaste supabase/schema.sql?
          </p>
        )}

        <EmailSettingsForm
          initial={
            settings && {
              host: settings.smtp_host,
              port: settings.smtp_port,
              user: settings.smtp_user,
              fromAddress: settings.from_address ?? '',
              fromName: settings.from_name ?? '',
              simulateSending: settings.simulate_sending,
              bypassRateLimit: settings.bypass_rate_limit,
              updatedAt: settings.updated_at,
              updatedBy: settings.updated_by,
            }
          }
        />
      </div>
    </div>
  )
}
