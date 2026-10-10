import { describe, expect, it } from 'vitest'
import { buildCsp, buildSecurityHeaders } from './headers'

const SUPABASE = 'https://abcdxyz.supabase.co'
const prod = { isDev: false, supabaseUrl: SUPABASE }
const dev = { isDev: true, supabaseUrl: SUPABASE }

const directive = (csp: string, name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `)) ?? ''

const headerValue = (opts: Parameters<typeof buildSecurityHeaders>[0], key: string) =>
  buildSecurityHeaders(opts).find((h) => h.key.toLowerCase() === key.toLowerCase())?.value

describe('buildSecurityHeaders', () => {
  it('evita clickjacking con X-Frame-Options y frame-ancestors', () => {
    expect(headerValue(prod, 'X-Frame-Options')).toBe('DENY')
    expect(directive(buildCsp(prod), 'frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  it('fuerza HTTPS durante al menos un año (HSTS)', () => {
    const hsts = headerValue(prod, 'Strict-Transport-Security') ?? ''
    expect(Number(/max-age=(\d+)/.exec(hsts)?.[1])).toBeGreaterThanOrEqual(31536000)
  })

  it('impide el sniffing de tipos y limita el Referer', () => {
    expect(headerValue(prod, 'X-Content-Type-Options')).toBe('nosniff')
    expect(headerValue(prod, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('desactiva APIs del navegador que la app no usa', () => {
    const policy = headerValue(prod, 'Permissions-Policy') ?? ''
    for (const api of ['camera', 'microphone', 'geolocation']) expect(policy).toContain(`${api}=()`)
  })

  it('incluye la CSP', () => {
    expect(headerValue(prod, 'Content-Security-Policy')).toBe(buildCsp(prod))
  })
})

describe('buildCsp', () => {
  const csp = buildCsp(prod)

  it('parte de una política restrictiva', () => {
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
  })

  it('permite Cloudflare Turnstile (script, iframe y conexión) y nada más externo en scripts', () => {
    expect(directive(csp, 'script-src')).toContain('https://challenges.cloudflare.com')
    expect(directive(csp, 'frame-src')).toContain('https://challenges.cloudflare.com')
    expect(directive(csp, 'connect-src')).toContain('https://challenges.cloudflare.com')
    expect(directive(csp, 'script-src').split(' ').filter((s) => s.startsWith('http'))).toEqual([
      'https://challenges.cloudflare.com',
    ])
  })

  it('permite conectar con el origen de Supabase (https y wss)', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect).toContain(SUPABASE)
    expect(connect).toContain('wss://abcdxyz.supabase.co')
  })

  it('no rompe sin URL de Supabase o con una inválida', () => {
    for (const supabaseUrl of [undefined, '', 'esto no es una url']) {
      const c = buildCsp({ isDev: false, supabaseUrl })
      expect(directive(c, 'connect-src')).toBe("connect-src 'self' https://challenges.cloudflare.com")
    }
  })

  it('en producción: sin unsafe-eval, sin comodines y con upgrade-insecure-requests', () => {
    expect(csp).not.toContain('unsafe-eval')
    expect(csp.split(/[\s;]+/)).not.toContain('*')
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('en desarrollo: unsafe-eval (React lo usa para depurar) y sin upgrade-insecure-requests', () => {
    const c = buildCsp(dev)
    expect(directive(c, 'script-src')).toContain("'unsafe-eval'")
    expect(c).not.toContain('upgrade-insecure-requests')
  })

  it('es una sola línea sin saltos (válida como valor de cabecera)', () => {
    expect(csp).not.toMatch(/[\r\n]/)
  })
})
