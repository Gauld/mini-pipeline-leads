import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encryptSecret } from '../security/secret-box'
import { buildTestEmail, resolveEmailConfig, resolveEmailMode, validateEmailSettings } from './settings'

describe('buildTestEmail', () => {
  it('compone un email de prueba al destinatario indicado', () => {
    const email = buildTestEmail('admin@x.com')
    expect(email.to).toBe('admin@x.com')
    expect(email.subject).toMatch(/prueba/i)
  })

  it('no expone host ni puerto del servidor SMTP en el cuerpo', () => {
    const email = buildTestEmail('admin@x.com')
    expect(email.text).not.toMatch(/servidor|smtp|:\d{2,5}/i)
  })
})

const key = randomBytes(32).toString('base64')

describe('validateEmailSettings', () => {
  const ok = { host: ' smtp.x.com ', port: '465', user: 'a@x.com', fromAddress: '', fromName: ' Academia ' }

  it('normaliza y acepta datos válidos', () => {
    expect(validateEmailSettings(ok)).toEqual({
      ok: true,
      value: { host: 'smtp.x.com', port: 465, user: 'a@x.com', fromAddress: null, fromName: 'Academia' },
    })
  })

  it('exige host y usuario', () => {
    expect(validateEmailSettings({ ...ok, host: ' ' }).ok).toBe(false)
    expect(validateEmailSettings({ ...ok, user: '' }).ok).toBe(false)
  })

  it('con simulación activa, host y usuario son opcionales (null si vacíos)', () => {
    const empty = { ...ok, host: '', user: '  ', simulateSending: true }
    expect(validateEmailSettings(empty)).toEqual({
      ok: true,
      value: { host: null, port: 465, user: null, fromAddress: null, fromName: 'Academia' },
    })
  })

  it('con simulación activa sigue validando lo que se informa', () => {
    expect(validateEmailSettings({ ...ok, simulateSending: true, port: 'abc' }).ok).toBe(false)
    expect(validateEmailSettings({ ...ok, simulateSending: true, host: 'a\nb' }).ok).toBe(false)
  })

  it('exige puerto entero entre 1 y 65535', () => {
    for (const port of ['0', '65536', 'abc', '25.5', '']) {
      expect(validateEmailSettings({ ...ok, port }).ok).toBe(false)
    }
  })

  it('valida el formato del remitente si se indica', () => {
    expect(validateEmailSettings({ ...ok, fromAddress: 'no-es-email' }).ok).toBe(false)
    expect(validateEmailSettings({ ...ok, fromAddress: 'info@x.com' }).ok).toBe(true)
  })

  it('rechaza saltos de línea (inyección de cabeceras)', () => {
    expect(validateEmailSettings({ ...ok, fromName: 'A\r\nBcc: x@y.com' }).ok).toBe(false)
    expect(validateEmailSettings({ ...ok, host: 'a\nb' }).ok).toBe(false)
  })
})

describe('resolveEmailConfig', () => {
  const env = { SMTP_HOST: 'env.host', SMTP_USER: 'env@x.com', SMTP_PASSWORD: 'envpw' }
  const row = {
    smtp_host: 'db.host',
    smtp_port: 465,
    smtp_user: 'db@x.com',
    smtp_password_encrypted: encryptSecret('dbpw', key),
    from_address: null,
    from_name: 'Academia',
    simulate_sending: false,
  }

  it('usa la configuración guardada en la base de datos, descifrando la contraseña', () => {
    expect(resolveEmailConfig(row, env, key)).toEqual({
      host: 'db.host',
      port: 465,
      secure: true,
      user: 'db@x.com',
      pass: 'dbpw',
      fromAddress: 'db@x.com',
      fromName: 'Academia',
    })
  })

  it('cae a las variables de entorno si no hay fila', () => {
    expect(resolveEmailConfig(null, env, key)?.host).toBe('env.host')
  })

  it('devuelve null si no hay ni fila ni entorno', () => {
    expect(resolveEmailConfig(null, {}, key)).toBeNull()
  })

  it('fila incompleta (guardada en modo simulación): cae al entorno', () => {
    const incomplete = { ...row, smtp_host: null, smtp_user: null, smtp_password_encrypted: null }
    expect(resolveEmailConfig(incomplete, env, undefined)?.host).toBe('env.host')
    expect(resolveEmailConfig(incomplete, {}, undefined)).toBeNull()
  })

  it('lanza si hay contraseña guardada pero no hay clave de cifrado', () => {
    expect(() => resolveEmailConfig(row, env, undefined)).toThrow(/SETTINGS_ENCRYPTION_KEY/)
  })

  it('puerto distinto de 465 no usa TLS implícito', () => {
    expect(resolveEmailConfig({ ...row, smtp_port: 587 }, env, key)?.secure).toBe(false)
  })
})

describe('resolveEmailMode', () => {
  const env = { SMTP_HOST: 'env.host', SMTP_USER: 'env@x.com', SMTP_PASSWORD: 'envpw' }
  const row = {
    smtp_host: 'db.host',
    smtp_port: 465,
    smtp_user: 'db@x.com',
    smtp_password_encrypted: encryptSecret('dbpw', key),
    from_address: null,
    from_name: null,
    simulate_sending: false,
  }

  it('fila con simulación desactivada: envía con la cuenta guardada', () => {
    const mode = resolveEmailMode(row, env, key)
    expect(mode.mode).toBe('send')
    expect(mode.mode === 'send' && mode.config.host).toBe('db.host')
  })

  it('fila con simulación activada: simula aunque haya cuenta y aunque falte la clave de cifrado', () => {
    expect(resolveEmailMode({ ...row, simulate_sending: true }, env, key)).toEqual({ mode: 'simulate' })
    expect(resolveEmailMode({ ...row, simulate_sending: true }, env, undefined)).toEqual({ mode: 'simulate' })
  })

  it('sin fila pero con entorno completo: envía con el respaldo del entorno', () => {
    const mode = resolveEmailMode(null, env, key)
    expect(mode.mode === 'send' && mode.config.host).toBe('env.host')
  })

  it('sin fila y sin entorno: simula', () => {
    expect(resolveEmailMode(null, {}, key)).toEqual({ mode: 'simulate' })
  })

  it('fila incompleta sin simulación y sin entorno: simula', () => {
    const incomplete = { ...row, smtp_host: null, smtp_user: null, smtp_password_encrypted: null }
    expect(resolveEmailMode(incomplete, {}, undefined)).toEqual({ mode: 'simulate' })
  })

  it('enviando con cuenta guardada y sin clave de cifrado: lanza (configuración errónea, no se simula)', () => {
    expect(() => resolveEmailMode(row, env, undefined)).toThrow(/SETTINGS_ENCRYPTION_KEY/)
  })
})
