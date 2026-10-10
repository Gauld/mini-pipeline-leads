// Cabeceras de seguridad HTTP. Función pura: next.config.ts las aplica.
//
// CSP SIN nonce, a propósito: un nonce obliga a renderizar TODAS las páginas por petición y
// es incompatible con PPR (doc de Next, guía Content Security Policy), y este proyecto usa
// cacheComponents/partialPrefetching. Se conserva 'unsafe-inline' en script/style (Next inyecta
// scripts inline); el resto de directivas (frame-ancestors, object-src, base-uri, form-action
// y lista cerrada de orígenes) sigue aportando protección.

const TURNSTILE = 'https://challenges.cloudflare.com'

export interface SecurityHeaderOptions {
  isDev: boolean
  supabaseUrl?: string
}

export interface HeaderEntry {
  key: string
  value: string
}

/** Orígenes https/wss de Supabase a los que puede conectar el navegador; vacío si la URL no es válida. */
function supabaseOrigins(supabaseUrl?: string): string[] {
  if (!supabaseUrl) return []
  try {
    const url = new URL(supabaseUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return []
    const ws = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return [url.origin, `${ws}//${url.host}`]
  } catch {
    return []
  }
}

export function buildCsp({ isDev, supabaseUrl }: SecurityHeaderOptions): string {
  const directives = [
    "default-src 'self'",
    // React usa eval en desarrollo para reconstruir errores; no es necesario en producción.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${TURNSTILE}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'", // next/font sirve Geist desde el propio dominio
    ['connect-src', "'self'", TURNSTILE, ...supabaseOrigins(supabaseUrl)].join(' '),
    `frame-src ${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // En local (http) forzar https rompería la app.
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ]
  return directives.join('; ')
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): HeaderEntry[] {
  return [
    { key: 'Content-Security-Policy', value: buildCsp(options) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ]
}
