import { describe, expect, it } from 'vitest'
import { clientIpFrom, hashKey } from './rate-limit'

describe('hashKey', () => {
  it('es determinista y depende de la sal', () => {
    expect(hashKey('ip', '1.2.3.4', 'sal')).toBe(hashKey('ip', '1.2.3.4', 'sal'))
    expect(hashKey('ip', '1.2.3.4', 'sal')).not.toBe(hashKey('ip', '1.2.3.4', 'otra'))
  })

  it('separa espacios de nombres y no contiene el dato en claro', () => {
    const a = hashKey('ip', 'x', 'sal')
    expect(a).not.toBe(hashKey('email', 'x', 'sal'))
    expect(a).not.toContain('x@')
    expect(a.startsWith('ip:')).toBe(true)
  })

  it('normaliza mayúsculas y espacios', () => {
    expect(hashKey('email', ' A@X.com ', 's')).toBe(hashKey('email', 'a@x.com', 's'))
  })
})

describe('clientIpFrom', () => {
  const h = (init: Record<string, string>) => new Headers(init)

  it('toma la IP más a la derecha añadida por la plataforma, no la primera falsificable', () => {
    expect(clientIpFrom(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('usa x-real-ip si no hay x-forwarded-for', () => {
    expect(clientIpFrom(h({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('devuelve "unknown" si no hay cabeceras', () => {
    expect(clientIpFrom(h({}))).toBe('unknown')
  })
})
