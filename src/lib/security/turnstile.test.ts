import { describe, expect, it, vi } from 'vitest'
import { verifyTurnstile } from './turnstile'

const ok = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }) as Response)

describe('verifyTurnstile', () => {
  it('acepta un token que Cloudflare valida', async () => {
    const fetcher = ok({ success: true })
    const r = await verifyTurnstile('tok', { secret: 's', ip: '1.2.3.4', fetcher, production: true })
    expect(r).toEqual({ success: true })
    const body = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams
    expect(body.get('secret')).toBe('s')
    expect(body.get('response')).toBe('tok')
    expect(body.get('remoteip')).toBe('1.2.3.4')
  })

  it('rechaza un token que Cloudflare invalida', async () => {
    const r = await verifyTurnstile('tok', { secret: 's', fetcher: ok({ success: false }), production: true })
    expect(r.success).toBe(false)
  })

  it('rechaza sin token y NO llama a Cloudflare', async () => {
    const fetcher = ok({ success: true })
    for (const token of [null, undefined, '', '   ']) {
      expect((await verifyTurnstile(token, { secret: 's', fetcher, production: true })).success).toBe(false)
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('en producción sin secreto rechaza SIEMPRE (cerrado por defecto)', async () => {
    const r = await verifyTurnstile('tok', { secret: undefined, fetcher: ok({ success: true }), production: true })
    expect(r.success).toBe(false)
  })

  it('en desarrollo sin secreto se omite la comprobación', async () => {
    const fetcher = ok({ success: true })
    const r = await verifyTurnstile(null, { secret: undefined, fetcher, production: false })
    expect(r).toEqual({ success: true })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rechaza (sin lanzar) si Cloudflare falla o no responde', async () => {
    const down = vi.fn(async () => {
      throw new Error('network')
    })
    expect((await verifyTurnstile('tok', { secret: 's', fetcher: down, production: true })).success).toBe(false)

    const http500 = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response)
    expect((await verifyTurnstile('tok', { secret: 's', fetcher: http500, production: true })).success).toBe(false)
  })
})
