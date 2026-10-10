import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildErrorEntry, logError, type ErrorLogEntry } from './log-error'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildErrorEntry', () => {
  it('normaliza un Error con mensaje y stack', () => {
    const entry = buildErrorEntry('createLead', new Error('boom'))
    expect(entry.source).toBe('createLead')
    expect(entry.message).toBe('boom')
    expect(entry.stack).toContain('boom')
    expect(entry.code).toBeNull()
  })

  it('normaliza errores de Supabase (objeto con message y code)', () => {
    const entry = buildErrorEntry('createLead', { message: 'duplicate key', code: '23505' })
    expect(entry.message).toBe('duplicate key')
    expect(entry.code).toBe('23505')
    expect(entry.stack).toBeNull()
  })

  it('acepta strings y valores desconocidos sin romper', () => {
    expect(buildErrorEntry('x', 'fallo plano').message).toBe('fallo plano')
    expect(buildErrorEntry('x', undefined).message).toBe('Error desconocido')
    expect(buildErrorEntry('x', 42).message).toBe('42')
  })

  it('trunca mensaje y stack para no llenar la tabla', () => {
    const entry = buildErrorEntry('x', new Error('a'.repeat(5000)))
    expect(entry.message.length).toBeLessThanOrEqual(1000)
    expect(entry.stack!.length).toBeLessThanOrEqual(4000)
  })

  it('redacta datos personales y secretos del contexto', () => {
    const entry = buildErrorEntry('x', new Error('e'), {
      leadId: 'abc',
      email: 'a@b.com',
      phone: '600',
      full_name: 'Juan',
      password: 'p',
      smtp_password: 'p',
      token: 't',
      body: 'texto',
    })
    expect(entry.context.leadId).toBe('abc')
    for (const key of ['email', 'phone', 'full_name', 'password', 'smtp_password', 'token', 'body']) {
      expect(entry.context[key]).toBe('[redacted]')
    }
  })

  it('el contexto por defecto es un objeto vacío', () => {
    expect(buildErrorEntry('x', new Error('e')).context).toEqual({})
  })
})

describe('logError', () => {
  it('escribe en consola y en el destino', async () => {
    const sink = vi.fn<(entry: ErrorLogEntry) => Promise<void>>().mockResolvedValue()
    await logError('createLead', new Error('boom'), { leadId: '1' }, sink)

    expect(console.error).toHaveBeenCalledWith('[createLead]', 'boom')
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink.mock.calls[0][0]).toMatchObject({ source: 'createLead', message: 'boom' })
  })

  it('NUNCA lanza aunque el destino falle', async () => {
    const sink = vi.fn().mockRejectedValue(new Error('db caída'))
    await expect(logError('x', new Error('e'), {}, sink)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('[logError] no se pudo persistir', 'db caída')
  })

  it('NUNCA lanza si el destino lanza de forma síncrona', async () => {
    const sink = vi.fn(() => {
      throw new Error('sync')
    })
    await expect(logError('x', 'e', {}, sink)).resolves.toBeUndefined()
  })
})
