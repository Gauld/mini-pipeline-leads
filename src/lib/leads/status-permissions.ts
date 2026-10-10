// Permisos de cambio de estado según el rol. Lógica pura; la acción y el trigger de la base
// (enforce_status_transition, supabase/schema.sql) aplican la misma regla.

// Roles (tabla user_roles). Sin fila => sin rol => sin ningún permiso, tampoco de consulta.
//   admin    : consulta, cambia el estado a cualquiera y gestiona el email.
//   operator : consulta, cambia el estado solo siguiendo las transiciones definidas
//              (tabla status_transitions) y gestiona el email.
//   viewer   : solo consulta.
export type AppRole = 'admin' | 'operator' | 'viewer'

export interface StatusRef {
  id: string
}

/** Transición permitida al operador: de un estado a otro (fila de status_transitions). */
export interface StatusTransition {
  from_status_id: string
  to_status_id: string
}

/** Cerrado por defecto: solo los roles conocidos cuentan; cualquier otro valor no es un rol. */
export function parseRole(value: unknown): AppRole | null {
  return value === 'admin' || value === 'operator' || value === 'viewer' ? value : null
}

/** Consultar leads e historial. Cualquier rol; sin rol, nada. */
export function canViewLeads(role: AppRole | null): boolean {
  return role !== null
}

/** Enviar seguimientos y editar plantillas y la configuración de email. */
export function canManageEmail(role: AppRole | null): boolean {
  return role === 'admin' || role === 'operator'
}

/**
 * Estados a los que `role` puede mover un lead que está en `currentStatusId`.
 * - admin: cualquiera salvo el actual.
 * - operator: los destinos definidos en `transitions` desde el estado actual (puede haber
 *   varios: p. ej. "En seguimiento" -> "Convertido" o "Perdido"). Sin transiciones, ninguno.
 * - viewer, sin rol o estado actual desconocido: ninguno.
 */
export function allowedTargetStatusIds(
  role: AppRole | null,
  currentStatusId: string,
  statuses: StatusRef[],
  transitions: StatusTransition[]
): string[] {
  const current = statuses.find((s) => s.id === currentStatusId)
  if (!role || role === 'viewer' || !current) return []

  if (role === 'admin') return statuses.filter((s) => s.id !== current.id).map((s) => s.id)

  const existing = new Set(statuses.map((s) => s.id))
  return transitions
    .filter((t) => t.from_status_id === current.id && t.to_status_id !== current.id)
    .map((t) => t.to_status_id)
    .filter((id) => existing.has(id))
}

export function canChangeStatus(
  role: AppRole | null,
  currentStatusId: string,
  targetStatusId: string,
  statuses: StatusRef[],
  transitions: StatusTransition[]
): boolean {
  return allowedTargetStatusIds(role, currentStatusId, statuses, transitions).includes(targetStatusId)
}
