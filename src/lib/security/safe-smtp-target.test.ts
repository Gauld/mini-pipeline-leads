import { describe, expect, it, vi } from 'vitest'
import {
  ALLOWED_SMTP_PORTS,
  allowInternalSmtp,
  isForbiddenHostname,
  isPrivateAddress,
  resolveSafeSmtpTarget,
} from './safe-smtp-target'

describe('isPrivateAddress', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.5',
    '10.255.255.255',
    '100.64.0.1', // CGNAT
    '127.0.0.1',
    '127.1.2.3',
    '169.254.169.254', // metadatos cloud
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1', // multicast
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1', // IPv4 mapeada en IPv6
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
  ])('%s es interna', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '142.250.185.109',
    '172.15.255.255', // justo antes de 172.16/12
    '172.32.0.1', // justo después
    '100.63.255.255',
    '2607:f8b0:4004:c1b::6a',
    '2a00:1450:4001:81a::200e',
    '::ffff:8.8.8.8',
  ])('%s es pública', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })

  it('cerrado por defecto: lo que no es una IP válida se trata como no seguro', () => {
    for (const v of ['', 'no-es-ip', '999.1.1.1', '1.2.3', '1.2.3.4.5']) {
      expect(isPrivateAddress(v)).toBe(true)
    }
  })
})

describe('isForbiddenHostname', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    'api.localhost',
    'impresora.local',
    'db.internal',
    'host.localdomain',
    'router.home.arpa',
    '',
    '   ',
  ])('%j está prohibido', (host) => {
    expect(isForbiddenHostname(host)).toBe(true)
  })

  it.each(['smtp.gmail.com', 'smtp.office365.com', 'mail.ejemplo.es', 'localhost.ejemplo.com'])(
    '%s está permitido',
    (host) => {
      expect(isForbiddenHostname(host)).toBe(false)
    }
  )
})

describe('allowInternalSmtp', () => {
  it('solo se activa fuera de producción y con SMTP_ALLOW_INTERNAL=true', () => {
    expect(allowInternalSmtp({ NODE_ENV: 'development', SMTP_ALLOW_INTERNAL: 'true' })).toBe(true)
    expect(allowInternalSmtp({ NODE_ENV: 'test', SMTP_ALLOW_INTERNAL: 'true' })).toBe(true)
  })

  it('NUNCA en producción, aunque la variable esté puesta', () => {
    expect(allowInternalSmtp({ NODE_ENV: 'production', SMTP_ALLOW_INTERNAL: 'true' })).toBe(false)
  })

  it('desactivado por defecto', () => {
    expect(allowInternalSmtp({ NODE_ENV: 'development' })).toBe(false)
    expect(allowInternalSmtp({ NODE_ENV: 'development', SMTP_ALLOW_INTERNAL: 'false' })).toBe(false)
    expect(allowInternalSmtp({})).toBe(false)
  })
})

describe('resolveSafeSmtpTarget', () => {
  const resolverTo = (...ips: string[]) => vi.fn(async () => ips)

  it('solo permite los puertos SMTP estándar', () => {
    expect([...ALLOWED_SMTP_PORTS]).toEqual([25, 465, 587, 2525])
  })

  it.each([22, 80, 443, 3306, 5432, 6379, 8080, 11211, 0, 65535])('rechaza el puerto %i', async (port) => {
    const resolver = resolverTo('8.8.8.8')
    const r = await resolveSafeSmtpTarget('smtp.gmail.com', port, { resolver })
    expect(r.ok).toBe(false)
    expect(resolver).not.toHaveBeenCalled()
  })

  it.each(ALLOWED_SMTP_PORTS)('acepta el puerto %i con un host público', async (port) => {
    const r = await resolveSafeSmtpTarget('smtp.gmail.com', port, { resolver: resolverTo('142.250.185.109') })
    expect(r).toEqual({ ok: true, address: '142.250.185.109' })
  })

  it('rechaza hosts prohibidos sin llegar a resolver DNS', async () => {
    const resolver = resolverTo('8.8.8.8')
    expect((await resolveSafeSmtpTarget('localhost', 587, { resolver })).ok).toBe(false)
    expect((await resolveSafeSmtpTarget('db.internal', 587, { resolver })).ok).toBe(false)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('rechaza una IP literal interna sin resolver DNS', async () => {
    const resolver = resolverTo('8.8.8.8')
    for (const host of ['127.0.0.1', '169.254.169.254', '10.0.0.5', '::1']) {
      expect((await resolveSafeSmtpTarget(host, 587, { resolver })).ok).toBe(false)
    }
    expect(resolver).not.toHaveBeenCalled()
  })

  it('acepta una IP literal pública y la devuelve tal cual', async () => {
    const resolver = resolverTo('1.1.1.1')
    expect(await resolveSafeSmtpTarget('8.8.8.8', 587, { resolver })).toEqual({ ok: true, address: '8.8.8.8' })
    expect(resolver).not.toHaveBeenCalled()
  })

  it('rechaza un nombre público que RESUELVE a una IP interna', async () => {
    const r = await resolveSafeSmtpTarget('evil.example.com', 587, { resolver: resolverTo('127.0.0.1') })
    expect(r.ok).toBe(false)
  })

  it('rechaza si CUALQUIERA de las IPs resueltas es interna (respuestas mixtas)', async () => {
    const r = await resolveSafeSmtpTarget('mixto.example.com', 587, {
      resolver: resolverTo('8.8.8.8', '169.254.169.254'),
    })
    expect(r.ok).toBe(false)
  })

  it('rechaza formas raras de IP que el sistema interpretaría como internas', async () => {
    // "0177.0.0.1" no es una IP válida para net.isIP, pero getaddrinfo la resuelve a 127.0.0.1.
    const r = await resolveSafeSmtpTarget('0177.0.0.1', 587, { resolver: resolverTo('127.0.0.1') })
    expect(r.ok).toBe(false)
  })

  it('rechaza si el DNS falla o no devuelve nada', async () => {
    const fails = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    })
    expect((await resolveSafeSmtpTarget('no-existe.example.com', 587, { resolver: fails })).ok).toBe(false)
    expect((await resolveSafeSmtpTarget('vacio.example.com', 587, { resolver: resolverTo() })).ok).toBe(false)
  })

  it('prefiere IPv4 cuando hay varias direcciones públicas', async () => {
    const r = await resolveSafeSmtpTarget('smtp.example.com', 465, {
      resolver: resolverTo('2607:f8b0:4004:c1b::6a', '142.250.185.109'),
    })
    expect(r).toEqual({ ok: true, address: '142.250.185.109' })
  })

  it('usa IPv6 si es la única dirección pública', async () => {
    const r = await resolveSafeSmtpTarget('v6.example.com', 465, { resolver: resolverTo('2607:f8b0:4004:c1b::6a') })
    expect(r).toEqual({ ok: true, address: '2607:f8b0:4004:c1b::6a' })
  })

  it('allowInternal (solo desarrollo) permite localhost y puertos no estándar', async () => {
    const r = await resolveSafeSmtpTarget('localhost', 1025, { allowInternal: true, resolver: resolverTo('127.0.0.1') })
    expect(r).toEqual({ ok: true, address: '127.0.0.1' })
  })

  it('por defecto allowInternal está desactivado', async () => {
    const r = await resolveSafeSmtpTarget('localhost', 587, { resolver: resolverTo('127.0.0.1') })
    expect(r.ok).toBe(false)
  })

  it('el mensaje de error es útil y no filtra la IP resuelta', async () => {
    const r = await resolveSafeSmtpTarget('evil.example.com', 587, { resolver: resolverTo('10.1.2.3') })
    expect(!r.ok && r.error).toBeTruthy()
    expect(!r.ok && r.error).not.toContain('10.1.2.3')
  })
})
