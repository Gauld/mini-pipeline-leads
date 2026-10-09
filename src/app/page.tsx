import { createClient } from '@/lib/supabase/server'
import { createLead } from '@/app/actions/public-leads'
import { connection } from 'next/server'
import FormClient from './FormClient'
export const instant = false
export default async function LeadFormPage() {
  // Opt-in explícito a renderizado dinámico compatible con cacheComponents
  await connection()

  const supabase = await createClient()

  const { data: oppositions } = await supabase
    .from('target_oppositions')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true })

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-slate-100">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Solicitar Información</h1>
        <p className="text-slate-600 text-sm mb-6">
          Déjanos tus datos y te asesoraremos sobre la oposición de tu interés.
        </p>

        <FormClient oppositions={oppositions || []} createLead={createLead} />
      </div>
    </main>
  )
}