import { z } from 'zod'

// Cambio de estado de un lead: validación de la entrada y lectura del
// resultado de la base. Lógica pura; la acción solo orquesta la llamada a Supabase.

const Uuid = z.guid()

export interface StatusChange {
  leadId: string
  oldStatusId: string
  newStatusId: string
}

export type ParsedStatusChange =
  | { ok: true; change: StatusChange }
  | { ok: true; noop: true }
  | { ok: false; error: string }

export function parseStatusChange(leadId: string, oldStatusId: string, newStatusId: string): ParsedStatusChange {
  const parsed = z
    .object({ leadId: Uuid, oldStatusId: Uuid, newStatusId: Uuid })
    .safeParse({ leadId, oldStatusId, newStatusId })

  if (!parsed.success) return { ok: false, error: 'Datos del cambio de estado no válidos.' }
  if (parsed.data.oldStatusId === parsed.data.newStatusId) return { ok: true, noop: true }
  return { ok: true, change: parsed.data }
}

export type StatusUpdateResult =
  | { success: true }
  | { success: false; error: string; conflict: boolean }

/**
 * Interpreta la respuesta de `update(...).eq('status_id', old).select('id')`.
 * Un UPDATE que no toca ninguna fila NO es un error en SQL: hay que mirar cuántas se devolvieron.
 * Cerrado por defecto: solo cuenta como éxito si volvió al menos una fila.
 */
export function interpretStatusUpdate({
  error,
  rows,
}: {
  error: { message: string } | null
  rows: unknown[] | null | undefined
}): StatusUpdateResult {
  // Mensaje genérico: el detalle de Postgres (tablas, políticas) se loguea, no se muestra.
  if (error) return { success: false, error: 'No se pudo actualizar el estado.', conflict: false }

  if (!rows || rows.length === 0) {
    return {
      success: false,
      error: 'El lead cambió de estado mientras lo editabas o ya no existe. Se ha recargado la lista.',
      conflict: true,
    }
  }

  return { success: true }
}
