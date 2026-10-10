import { describe, expect, it, vi } from 'vitest'
import { buildWelcomeEmail, processWelcomeEmail, type WelcomeDeps } from './welcome-email'
import type { SmtpConfig } from '../email/send-email'

const lead = { id: 'l1', full_name: 'Ana Pérez', email: 'ana@example.com', target_opposition: 'Justicia' }
const template = { subject: 'Hola {{nombre}}', body: 'Sobre {{oposicion}}, {{nombre}}.' }
const config: SmtpConfig = {
  host: 'smtp.x.com',
  port: 465,
  secure: true,
  user: 'u@x.com',
  pass: 'p',
  fromAddress: 'u@x.com',
  fromName: 'Academia',
}

function makeDeps(overrides: Partial<WelcomeDeps> = {}): WelcomeDeps {
  return {
    claimLead: vi.fn().mockResolvedValue(lead),
    releaseLead: vi.fn().mockResolvedValue(undefined),
    loadTemplate: vi.fn().mockResolvedValue(template),
    loadConfig: vi.fn().mockResolvedValue({ mode: 'send', config }),
    send: vi.fn().mockResolvedValue({ success: true }),
    logSent: vi.fn().mockResolvedValue(undefined),
    logFailed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('buildWelcomeEmail', () => {
  it('renderiza asunto y cuerpo y apunta al email del lead', () => {
    expect(buildWelcomeEmail(template, lead)).toEqual({
      to: 'ana@example.com',
      subject: 'Hola Ana Pérez',
      text: 'Sobre Justicia, Ana Pérez.',
    })
  })
})

describe('processWelcomeEmail', () => {
  it('envía y no libera el lead cuando todo va bien', async () => {
    const deps = makeDeps()
    expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'sent' })
    expect(deps.send).toHaveBeenCalledWith(
      { to: 'ana@example.com', subject: 'Hola Ana Pérez', text: 'Sobre Justicia, Ana Pérez.' },
      config
    )
    expect(deps.releaseLead).not.toHaveBeenCalled()
  })

  it('omite si el lead ya estaba reservado/enviado (idempotencia)', async () => {
    const deps = makeDeps({ claimLead: vi.fn().mockResolvedValue(null) })
    expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'skipped' })
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.releaseLead).not.toHaveBeenCalled()
  })

  it('libera el lead si falta la plantilla', async () => {
    const deps = makeDeps({ loadTemplate: vi.fn().mockResolvedValue(null) })
    const result = await processWelcomeEmail(deps, 'l1')
    expect(result.status).toBe('error')
    expect(deps.releaseLead).toHaveBeenCalledWith('l1')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('libera el lead si el email no está configurado', async () => {
    const deps = makeDeps({ loadConfig: vi.fn().mockResolvedValue({ error: 'Email no configurado' }) })
    expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'error', error: 'Email no configurado' })
    expect(deps.releaseLead).toHaveBeenCalledWith('l1')
  })

  it('libera el lead si el SMTP falla, para poder reintentar', async () => {
    const deps = makeDeps({ send: vi.fn().mockResolvedValue({ success: false, error: 'boom' }) })
    expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'error', error: 'boom' })
    expect(deps.releaseLead).toHaveBeenCalledWith('l1')
  })

  it('registra en el historial asunto y cuerpo renderizados solo tras un envío exitoso', async () => {
    const deps = makeDeps()
    await processWelcomeEmail(deps, 'l1')
    expect(deps.logSent).toHaveBeenCalledWith('l1', 'Hola Ana Pérez', 'Sobre Justicia, Ana Pérez.')
  })

  it('no registra en el historial si el envío falla', async () => {
    const deps = makeDeps({ send: vi.fn().mockResolvedValue({ success: false, error: 'boom' }) })
    await processWelcomeEmail(deps, 'l1')
    expect(deps.logSent).not.toHaveBeenCalled()
  })

  it('si falla el historial, el email ya salió: devuelve sent y NO libera (evita reenviar)', async () => {
    const deps = makeDeps({ logSent: vi.fn().mockRejectedValue(new Error('db caída')) })
    expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'sent' })
    expect(deps.releaseLead).not.toHaveBeenCalled()
  })

  it('libera el lead si algo lanza una excepción', async () => {
    const deps = makeDeps({ send: vi.fn().mockRejectedValue(new Error('red caída')) })
    expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'error', error: 'red caída' })
    expect(deps.releaseLead).toHaveBeenCalledWith('l1')
  })


  describe('modo simulación', () => {
    const simulate = () => ({ loadConfig: vi.fn().mockResolvedValue({ mode: 'simulate' }) })

    it('no envía, registra como enviado con el asunto y cuerpo renderizados y no libera', async () => {
      const deps = makeDeps(simulate())
      expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'simulated' })
      expect(deps.send).not.toHaveBeenCalled()
      expect(deps.logSent).toHaveBeenCalledWith('l1', 'Hola Ana Pérez', 'Sobre Justicia, Ana Pérez.')
      expect(deps.logFailed).not.toHaveBeenCalled()
      expect(deps.releaseLead).not.toHaveBeenCalled()
    })
  })

  describe('registro de fallos en el historial', () => {
    it('si el SMTP falla, registra el error con el asunto y cuerpo, y libera el lead', async () => {
      const deps = makeDeps({ send: vi.fn().mockResolvedValue({ success: false, error: '535 auth' }) })
      await processWelcomeEmail(deps, 'l1')
      expect(deps.logFailed).toHaveBeenCalledWith('l1', 'Hola Ana Pérez', 'Sobre Justicia, Ana Pérez.', '535 auth')
      expect(deps.releaseLead).toHaveBeenCalledWith('l1')
    })

    it('si la configuración es inválida, registra el error en el historial', async () => {
      const deps = makeDeps({ loadConfig: vi.fn().mockResolvedValue({ error: 'Falta clave' }) })
      expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'error', error: 'Falta clave' })
      expect(deps.logFailed).toHaveBeenCalledWith('l1', 'Hola Ana Pérez', 'Sobre Justicia, Ana Pérez.', 'Falta clave')
    })

    it('si send lanza una excepción, también se registra', async () => {
      const deps = makeDeps({ send: vi.fn().mockRejectedValue(new Error('red caída')) })
      await processWelcomeEmail(deps, 'l1')
      expect(deps.logFailed).toHaveBeenCalledWith('l1', 'Hola Ana Pérez', 'Sobre Justicia, Ana Pérez.', 'red caída')
    })

    it('si falla el propio registro, el error original no se pierde y el lead se libera', async () => {
      const deps = makeDeps({
        send: vi.fn().mockResolvedValue({ success: false, error: 'boom' }),
        logFailed: vi.fn().mockRejectedValue(new Error('db caída')),
      })
      expect(await processWelcomeEmail(deps, 'l1')).toEqual({ status: 'error', error: 'boom' })
      expect(deps.releaseLead).toHaveBeenCalledWith('l1')
    })

    it('sin plantilla no hay asunto que registrar: solo se libera', async () => {
      const deps = makeDeps({ loadTemplate: vi.fn().mockResolvedValue(null) })
      await processWelcomeEmail(deps, 'l1')
      expect(deps.logFailed).not.toHaveBeenCalled()
    })
  })
})
