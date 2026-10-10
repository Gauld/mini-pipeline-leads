/**
 * Registro de errores.
 *
 * `logError` escribe SIEMPRE en consola y, además, intenta guardar el error en la tabla
 * `error_logs` de Supabase (solo service_role puede escribirla). Nunca lanza: registrar un
 * error no puede provocar otro error ni cambiar la respuesta al usuario.
 *
 * Solo servidor: usa el cliente admin. No importar desde componentes de cliente.
 */

export type ErrorLogEntry = {
  source: string
  message: string
  code: string | null
  stack: string | null
  context: Record<string, unknown>
}

export type ErrorSink = (entry: ErrorLogEntry) => Promise<void> | void

const MAX_MESSAGE = 1000
const MAX_STACK = 4000

// Claves del contexto que pueden llevar datos personales o secretos: se guardan redactadas.
const SENSITIVE_KEY = /pass|secret|token|key|email|phone|tel[eé]fono|name|nombre|body|subject|asunto/i

function normalize(error: unknown): { message: string; code: string | null; stack: string | null } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return { message: error.message, code: typeof code === 'string' ? code : null, stack: error.stack ?? null }
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message, code } = error as { message: unknown; code?: unknown }
    return { message: String(message), code: typeof code === 'string' ? code : null, stack: null }
  }
  if (error === undefined || error === null) {
    return { message: 'Error desconocido', code: null, stack: null }
  }
  return { message: String(error), code: null, stack: null }
}

function redact(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? '[redacted]' : value])
  )
}

export function buildErrorEntry(
  source: string,
  error: unknown,
  context: Record<string, unknown> = {}
): ErrorLogEntry {
  const { message, code, stack } = normalize(error)
  return {
    source,
    message: message.slice(0, MAX_MESSAGE),
    code,
    stack: stack ? stack.slice(0, MAX_STACK) : null,
    context: redact(context),
  }
}

async function supabaseSink(entry: ErrorLogEntry): Promise<void> {
  // Import dinámico: el cliente admin exige variables de entorno que los tests no tienen.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { error } = await createAdminClient().from('error_logs').insert(entry)
  if (error) throw new Error(error.message)
}

export async function logError(
  source: string,
  error: unknown,
  context: Record<string, unknown> = {},
  sink: ErrorSink = supabaseSink
): Promise<void> {
  const entry = buildErrorEntry(source, error, context)
  console.error(`[${source}]`, entry.message)

  try {
    await sink(entry)
  } catch (err) {
    console.error('[logError] no se pudo persistir', err instanceof Error ? err.message : err)
  }
}
