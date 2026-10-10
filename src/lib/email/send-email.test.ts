import { describe, expect, it, vi } from 'vitest'
import { buildTransportOptions, createEmailSender, readEmailConfig } from './send-email'

describe('buildTransportOptions', () => {
  const config = {
    host: 'smtp.x.com',
    port: 587,
    secure: false,
    user: 'a@x.com',
    pass: 'pw',
    fromAddress: 'a@x.com',
    fromName: '',
  }

  it('exige STARTTLS cuando no hay TLS implícito (nunca envía en claro)', () => {
    expect(buildTransportOptions(config)).toMatchObject({ secure: false, requireTLS: true })
  })

  it('con TLS implícito (465) no necesita STARTTLS', () => {
    expect(buildTransportOptions({ ...config, port: 465, secure: true })).toMatchObject({
      secure: true,
      requireTLS: false,
    })
  })

  it('sin IP fijada conecta por nombre y no toca la configuración TLS', () => {
    const options = buildTransportOptions(config)
    expect(options.host).toBe('smtp.x.com')
    expect(options).not.toHaveProperty('tls')
  })

  it('con IP fijada conecta a ESA IP pero valida el certificado contra el nombre (anti DNS rebinding)', () => {
    expect(buildTransportOptions(config, '203.0.113.7')).toMatchObject({
      host: '203.0.113.7',
      port: 587,
      tls: { servername: 'smtp.x.com' },
    })
  })

  it('la IP fijada no cambia el modo TLS ni las credenciales', () => {
    expect(buildTransportOptions(config, '203.0.113.7')).toMatchObject({
      secure: false,
      requireTLS: true,
      auth: { user: 'a@x.com', pass: 'pw' },
    })
  })

  it('incluye host, puerto y credenciales', () => {
    expect(buildTransportOptions(config)).toMatchObject({
      host: 'smtp.x.com',
      port: 587,
      auth: { user: 'a@x.com', pass: 'pw' },
    })
  })
})

describe('createEmailSender', () => {
  it('envía texto plano con remitente nombrado', async () => {
    const sendMail = vi.fn().mockResolvedValue({})
    const send = createEmailSender({ sendMail }, { fromAddress: 'a@x.com', fromName: 'Academia' })

    const result = await send({ to: 'lead@x.com', subject: 'Hola', text: 'Cuerpo' })

    expect(result).toEqual({ success: true })
    expect(sendMail).toHaveBeenCalledWith({
      from: '"Academia" <a@x.com>',
      to: 'lead@x.com',
      subject: 'Hola',
      text: 'Cuerpo',
    })
  })

  it('usa solo la dirección si no hay nombre', async () => {
    const sendMail = vi.fn().mockResolvedValue({})
    const send = createEmailSender({ sendMail }, { fromAddress: 'a@x.com' })

    await send({ to: 'lead@x.com', subject: 's', text: 't' })

    expect(sendMail.mock.calls[0][0].from).toBe('a@x.com')
  })

  it('devuelve error (sin lanzar) si el transporte falla', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('535 bad credentials'))
    const send = createEmailSender({ sendMail }, { fromAddress: 'a@x.com' })

    const result = await send({ to: 'lead@x.com', subject: 's', text: 't' })

    expect(result.success).toBe(false)
    expect(result).toHaveProperty('error')
  })

  it.each([
    ['varias con coma', 'a@x.com,b@y.com'],
    ['varias con punto y coma', 'a@x.com;b@y.com'],
    ['con espacio', 'a@x.com b@y.com'],
    ['con salto de línea (cabecera inyectada)', 'a@x.com\nBcc: b@y.com'],
    ['con nombre y ángulos', 'Nombre <a@x.com>'],
    ['vacío', ''],
  ])('rechaza un destinatario %s SIN llamar al transporte', async (_label, to) => {
    const sendMail = vi.fn().mockResolvedValue({})
    const send = createEmailSender({ sendMail }, { fromAddress: 'a@x.com' })

    const result = await send({ to, subject: 's', text: 't' })

    expect(result.success).toBe(false)
    expect(sendMail).not.toHaveBeenCalled()
  })
})

describe('readEmailConfig', () => {
  const base = { SMTP_HOST: 'smtp.x.com', SMTP_USER: 'a@x.com', SMTP_PASSWORD: 'pw' }

  it('devuelve null si falta host, usuario o contraseña', () => {
    expect(readEmailConfig({})).toBeNull()
    expect(readEmailConfig({ ...base, SMTP_HOST: undefined })).toBeNull()
    expect(readEmailConfig({ ...base, SMTP_USER: undefined })).toBeNull()
    expect(readEmailConfig({ ...base, SMTP_PASSWORD: undefined })).toBeNull()
  })

  it('aplica valores por defecto: puerto 587 sin TLS implícito, remitente = usuario', () => {
    expect(readEmailConfig(base)).toEqual({
      host: 'smtp.x.com',
      port: 587,
      secure: false,
      user: 'a@x.com',
      pass: 'pw',
      fromAddress: 'a@x.com',
      fromName: '',
    })
  })

  it('puerto 465 activa TLS implícito', () => {
    expect(readEmailConfig({ ...base, SMTP_PORT: '465' })).toMatchObject({ port: 465, secure: true })
  })

  it('SMTP_SECURE tiene prioridad sobre el puerto', () => {
    expect(readEmailConfig({ ...base, SMTP_PORT: '465', SMTP_SECURE: 'false' })?.secure).toBe(false)
  })

  it('puerto inválido cae al 587', () => {
    expect(readEmailConfig({ ...base, SMTP_PORT: 'abc' })?.port).toBe(587)
  })

  it('usa EMAIL_FROM y EMAIL_FROM_NAME si existen', () => {
    expect(
      readEmailConfig({ ...base, EMAIL_FROM: 'info@x.com', EMAIL_FROM_NAME: 'Academia' })
    ).toMatchObject({ fromAddress: 'info@x.com', fromName: 'Academia' })
  })

  it('quita los espacios de la contraseña (contraseñas de aplicación de Gmail)', () => {
    expect(readEmailConfig({ ...base, SMTP_PASSWORD: 'abcd efgh ijkl' })?.pass).toBe('abcdefghijkl')
  })
})
