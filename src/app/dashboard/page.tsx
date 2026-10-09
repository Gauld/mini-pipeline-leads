import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { Lead } from '@/types'
import StatusSelect from './StatusSelect'
import LeadHistoryModal from './LeadHistoryModal'

export const instant = false

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Verificación de autenticación de administrador
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // 2. Obtener estados configurados
  const { data: statuses } = await supabase
    .from('lead_statuses')
    .select('*')
    .order('position', { ascending: true })

  // 3. Obtener lista de leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*, lead_statuses(*)')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Panel de Control de Leads
            </h1>
            <p className="text-sm text-slate-500">
              Bienvenido, <span className="font-medium text-slate-700">{user.email}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
              Total Leads: {leads?.length || 0}
            </span>

            <form action={logout}>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors"
              >
                Cerrar Sesión
              </button>
            </form>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Nombre completo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Oposición de interés
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200 text-sm text-slate-700">
              {leads && leads.length > 0 ? (
                leads.map((lead: Lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                      {lead.full_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-slate-800">{lead.email}</div>
                      <div className="text-xs text-slate-500">{lead.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-700 font-medium text-xs">
                        {lead.target_opposition}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusSelect
                        leadId={lead.id}
                        currentStatusId={lead.status_id}
                        statuses={statuses || []}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-xs">
                      {new Date(lead.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                      <LeadHistoryModal
                        leadId={lead.id}
                        leadName={lead.full_name}
                        statuses={statuses || []}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No hay registros de leads todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}