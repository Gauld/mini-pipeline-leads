import { describe, expect, it } from 'vitest'
import { interpretStatusUpdate, parseStatusChange } from './status-change'

const LEAD = '11111111-1111-4111-8111-111111111111'
const OLD = '22222222-2222-4222-8222-222222222222'
const NEW = '33333333-3333-4333-8333-333333333333'

describe('parseStatusChange', () => {
  it('acepta tres UUID válidos y distintos', () => {
    expect(parseStatusChange(LEAD, OLD, NEW)).toEqual({
      ok: true,
      change: { leadId: LEAD, oldStatusId: OLD, newStatusId: NEW },
    })
  })

  it('si el estado nuevo es el mismo, no hay nada que hacer (sin tocar la base)', () => {
    expect(parseStatusChange(LEAD, OLD, OLD)).toEqual({ ok: true, noop: true })
  })

  it.each([
    ['lead vacío', '', OLD, NEW],
    ['lead no UUID', 'abc', OLD, NEW],
    ['estado antiguo no UUID', LEAD, 'x', NEW],
    ['estado nuevo no UUID', LEAD, OLD, 'estado-inventado'],
    ['inyección en el estado nuevo', LEAD, OLD, `${NEW}' or 1=1 --`],
    ['espacios alrededor', ` ${LEAD}`, OLD, NEW],
  ])('rechaza %s', (_label, leadId, oldId, newId) => {
    const r = parseStatusChange(leadId, oldId, newId)
    expect(r.ok).toBe(false)
  })

  it('rechaza valores que no son texto', () => {
    expect(parseStatusChange(null as unknown as string, OLD, NEW).ok).toBe(false)
    expect(parseStatusChange(LEAD, undefined as unknown as string, NEW).ok).toBe(false)
    expect(parseStatusChange(LEAD, OLD, 42 as unknown as string).ok).toBe(false)
  })

  it('no considera no-op un par inválido aunque sean iguales', () => {
    expect(parseStatusChange(LEAD, 'x', 'x').ok).toBe(false)
  })
})

describe('interpretStatusUpdate', () => {
  it('éxito: se actualizó exactamente una fila', () => {
    expect(interpretStatusUpdate({ error: null, rows: [{ id: LEAD }] })).toEqual({ success: true })
  })

  it('CERO filas: el lead no existe, RLS lo filtró o alguien lo cambió antes => conflicto, NO éxito', () => {
    const r = interpretStatusUpdate({ error: null, rows: [] })
    expect(r.success).toBe(false)
    expect(!r.success && r.conflict).toBe(true)
    expect(!r.success && r.error).toMatch(/cambi|existe|recarga/i)
  })

  it('cerrado por defecto: sin filas devueltas (null/undefined) tampoco es éxito', () => {
    expect(interpretStatusUpdate({ error: null, rows: null }).success).toBe(false)
    expect(interpretStatusUpdate({ error: null, rows: undefined }).success).toBe(false)
  })

  it('un error de la base es fallo y NO es un conflicto', () => {
    const r = interpretStatusUpdate({ error: { message: 'permission denied for table leads' }, rows: null })
    expect(r.success).toBe(false)
    expect(!r.success && r.conflict).toBe(false)
  })

  it('el mensaje de error no filtra detalles internos de Postgres', () => {
    const r = interpretStatusUpdate({ error: { message: 'permission denied for table leads' }, rows: null })
    expect(!r.success && r.error).not.toContain('leads')
    expect(!r.success && r.error).not.toContain('permission')
  })

  it('un error tiene prioridad aunque también vengan filas', () => {
    const r = interpretStatusUpdate({ error: { message: 'boom' }, rows: [{ id: LEAD }] })
    expect(r.success).toBe(false)
  })
})
