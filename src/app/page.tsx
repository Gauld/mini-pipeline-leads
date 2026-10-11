import { createClient } from '@/lib/supabase/server'
import { createLead } from '@/app/actions/public-leads'
import { connection } from 'next/server'
import Link from 'next/link'
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
    <main className="public-theme page page-center">
      <div className="card max-w-xl">
        <h1 className="page-title">Solicitar Información</h1>
        <p className="page-subtitle">
          Déjanos tus datos y te asesoraremos sobre la oposición de tu interés.
        </p>

        <FormClient oppositions={oppositions || []} createLead={createLead} />

        <p className="footer-links">
          <Link href="/aviso-legal">
            Aviso legal
          </Link>
          {' · '}
          <Link href="/privacidad">
            Política de privacidad
          </Link>
        </p>
      </div>
    </main>
  )
}