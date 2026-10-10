import type { Instrumentation } from 'next'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportMissingEnv } = await import('@/lib/config/check-env')
  reportMissingEnv()
}

/**
 * Red de seguridad: errores NO capturados del servidor (render del
 * dashboard, route handlers, Server Actions) acaban en `error_logs`.
 * Solo se guarda path, método y contexto de ruta: NUNCA cabeceras (llevan cookies de sesión).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // El cliente admin y el módulo de logs solo existen en el runtime de Node.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { logError } = await import('@/lib/logging/log-error')
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined

  await logError('next.onRequestError', err, {
    digest,
    path: request.path.split('?')[0],
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  })
}
