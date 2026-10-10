import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { logError } from '@/lib/logging/log-error'
import TemplateEditor from './TemplateEditor'

export const instant = false

export default async function TemplatesPage() {
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: statuses } = await supabase
    .from('lead_statuses')
    .select('*')
    .order('position', { ascending: true })

  const { data: templates, error: templatesError } = await supabase
    .from('email_templates')
    .select('*')

  if (templatesError) await logError('dashboard.plantillas.query', templatesError)

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Plantillas de email</h1>
            <p className="text-sm text-slate-500">
              Una plantilla por estado. Se usan en el botón de seguimiento.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ← Volver al panel
          </Link>
        </div>

        {templatesError && (
          <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            No se pudieron cargar las plantillas: {templatesError.message}. ¿Ejecutaste
            supabase/schema.sql?
          </p>
        )}

        <TemplateEditor statuses={statuses ?? []} templates={templates ?? []} />
      </div>
    </div>
  )
}
