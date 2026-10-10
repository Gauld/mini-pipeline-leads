/**
 * Variables de entorno obligatorias. Se comprueban al arrancar el
 * servidor (src/instrumentation.ts) para que una configuración incompleta se vea en el
 * arranque y no como un error genérico en el formulario.
 */
const ALWAYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']

const PRODUCTION_ONLY = ['RATE_LIMIT_SALT', 'TURNSTILE_SECRET_KEY', 'AUTOMATION_SECRET', 'SETTINGS_ENCRYPTION_KEY']

type Env = Record<string, string | undefined>

export function missingEnv(env: Env): string[] {
  const required = env.NODE_ENV === 'production' ? [...ALWAYS, ...PRODUCTION_ONLY] : ALWAYS
  return required.filter((name) => !env[name]?.trim())
}

/** Imprime un aviso visible si falta alguna variable. No lanza: el arranque no se bloquea. */
export function reportMissingEnv(env: Env = process.env): void {
  const missing = missingEnv(env)
  if (missing.length === 0) return
  console.error(
    [
      '',
      '!!! CONFIGURACIÓN INCOMPLETA: faltan variables de entorno en el servidor !!!',
      ...missing.map((name) => `    - ${name}`),
      '    Revisa .env.local (ver env.example). Hasta entonces el formulario devolverá errores genéricos.',
      '',
    ].join('\n')
  )
}
