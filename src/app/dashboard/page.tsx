import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { logout } from '@/app/actions/auth'
import Link from 'next/link'
import { filterLeads } from '@/lib/leads/filter-leads'
import { logError } from '@/lib/logging/log-error'
import { allowedTargetStatusIds, canConfigureEmail, canManageEmail, canViewLeads } from '@/lib/leads/status-permissions'
import { loadRole } from '@/lib/auth/load-role'
import { loadTransitions } from '@/lib/auth/load-transitions'
import NoAccess from './NoAccess'
import StatusSelect from './StatusSelect'
import LeadHistoryModal from './LeadHistoryModal'
import FollowUpButton from './FollowUpButton'

export const instant = false

const firstValue = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? ''

// Estados finales del pipeline: arrancan colapsados para no tapar el trabajo diario.
const TERMINAL_STATUS_SLUGS = new Set(['convertido', 'perdido'])

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // Panel autenticado: se renderiza por request. Supabase compara la expiración
  // del token con Date.now(), valor inestable que Cache Components no permite prerenderizar.
  await connection()

  const params = await searchParams
  const name = firstValue(params.name)
  const email = firstValue(params.email)
  const phone = firstValue(params.phone)
  const statusId = firstValue(params.status)

  const supabase = await createClient()

  // 1. Verificación de autenticación de administrador
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // 2. Rol (tabla user_roles). Sin rol no hay ningún permiso, tampoco de consulta.
  const role = await loadRole(supabase, user.id)
  if (!canViewLeads(role)) {
    return <NoAccess email={user.email ?? ''} />
  }

  // 3. Obtener estados configurados y leads
  const { data: statuses, error: statusesError } = await supabase
    .from('lead_statuses')
    .select('*')
    .order('position', { ascending: true })

  const transitions = await loadTransitions(supabase)

  const { data: templates, error: templatesError } = await supabase
    .from('email_templates')
    .select('*')

  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  const queryError = statusesError ?? templatesError ?? leadsError
  if (queryError) await logError('dashboard.page.query', queryError)

  const filteredLeads = filterLeads(leads ?? [], { statusId, name, email, phone })
  const hasFilters = Boolean(statusId || name || email || phone)

  // Un grupo por estado, en orden de pipeline (position). Con filtro de estado queda uno solo.
  const groups = (statuses ?? [])
    .filter((status) => !statusId || status.id === statusId)
    .map((status) => ({
      status,
      leads: filteredLeads.filter((lead) => lead.status_id === status.id),
    }))

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-full mx-auto">
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

            {canConfigureEmail(role) && (
              <>
                <Link
                  href="/dashboard/plantillas"
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Plantillas de email
                </Link>

                <Link
                  href="/dashboard/configuracion"
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Configuración de email
                </Link>
              </>
            )}

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

        <form
          method="get"
          className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input
            type="text"
            name="name"
            defaultValue={name}
            placeholder="Nombre"
            aria-label="Filtrar por nombre"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
          />
          <input
            type="text"
            name="email"
            defaultValue={email}
            placeholder="Correo"
            aria-label="Filtrar por correo"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
          />
          <input
            type="text"
            name="phone"
            defaultValue={phone}
            placeholder="Teléfono"
            aria-label="Filtrar por teléfono"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
          />
          <select
            name="status"
            defaultValue={statusId}
            aria-label="Filtrar por estado"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
          >
            <option value="">Todos los estados</option>
            {(statuses ?? []).map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Filtrar
            </button>
            {hasFilters && (
              <Link
                href="/dashboard"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Limpiar
              </Link>
            )}
          </div>
        </form>

        <p className="mb-2 text-xs text-slate-500">
          Mostrando {filteredLeads.length} de {leads?.length || 0}
        </p>

        <div className="space-y-4">
          {groups.map(({ status, leads: groupLeads }) => (
            <details
              key={status.id}
              open={Boolean(statusId) || !TERMINAL_STATUS_SLUGS.has(status.slug) || undefined}
              className="group rounded-xl border border-slate-200 bg-white"
            >
              <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-800">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: status.color ?? '#6B7280' }}
                />
                {status.name}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {groupLeads.length}
                </span>
              </summary>

              <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Oposición</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Alta</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupLeads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Sin leads
                  </td>
                </tr>
              )}

              {groupLeads.map((lead) => (
                <tr key={lead.id} className="align-middle">
                  <td className="px-4 py-3 font-medium text-slate-900">{lead.full_name}</td>
                  <td className="px-4 py-3 text-slate-600 break-all">{lead.email}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{lead.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.target_opposition}</td>
                  <td className="px-4 py-3">
                    {/* key = estado real: si cambia en el servidor (otro admin, conflicto), el
                        desplegable se reinicia y no se queda mostrando un estado obsoleto. */}
                    <StatusSelect
                      key={lead.status_id}
                      leadId={lead.id}
                      currentStatusId={lead.status_id}
                      statuses={statuses ?? []}
                      allowedStatusIds={allowedTargetStatusIds(role, lead.status_id, statuses ?? [], transitions)}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <LeadHistoryModal
                        leadId={lead.id}
                        leadName={lead.full_name}
                        statuses={statuses ?? []}
                      />
                      {canManageEmail(role) && (
                        <FollowUpButton
                          lead={lead}
                          templates={templates ?? []}
                          statuses={statuses ?? []}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
