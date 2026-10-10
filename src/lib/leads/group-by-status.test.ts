import { describe, expect, it } from 'vitest'
import type { Lead, LeadStatus } from '@/types'
import { groupLeadsByStatus } from './group-by-status'

const status = (id: string, position: number): LeadStatus => ({
  id,
  created_at: '2026-01-01T00:00:00Z',
  name: `Estado ${id}`,
  slug: `estado-${id}`,
  position,
  color: '#000000',
})

const lead = (id: string, status_id: string): Lead => ({
  id,
  created_at: '2026-01-01T00:00:00Z',
  full_name: `Lead ${id}`,
  email: `${id}@ejemplo.com`,
  phone: '600000000',
  target_opposition: 'Auxiliar Administrativo',
  status_id,
})

describe('groupLeadsByStatus', () => {
  it('devuelve una columna por estado, ordenada por position', () => {
    const statuses = [status('c', 3), status('a', 1), status('b', 2)]

    const columns = groupLeadsByStatus([], statuses)

    expect(columns.map((c) => c.status.id)).toEqual(['a', 'b', 'c'])
  })

  it('incluye los estados sin leads con lista vacía', () => {
    const columns = groupLeadsByStatus([lead('1', 'a')], [status('a', 1), status('b', 2)])

    expect(columns[1].leads).toEqual([])
  })

  it('agrupa cada lead en la columna de su estado', () => {
    const leads = [lead('1', 'a'), lead('2', 'b'), lead('3', 'a')]

    const columns = groupLeadsByStatus(leads, [status('a', 1), status('b', 2)])

    expect(columns[0].leads.map((l) => l.id)).toEqual(['1', '3'])
    expect(columns[1].leads.map((l) => l.id)).toEqual(['2'])
  })

  it('conserva el orden de entrada de los leads dentro de cada columna', () => {
    const leads = [lead('z', 'a'), lead('m', 'a'), lead('b', 'a')]

    const columns = groupLeadsByStatus(leads, [status('a', 1)])

    expect(columns[0].leads.map((l) => l.id)).toEqual(['z', 'm', 'b'])
  })

  it('excluye leads cuyo estado no existe en el catálogo', () => {
    const columns = groupLeadsByStatus([lead('1', 'fantasma')], [status('a', 1)])

    expect(columns[0].leads).toEqual([])
  })

  it('no muta los arrays de entrada', () => {
    const statuses = [status('b', 2), status('a', 1)]
    const snapshot = structuredClone(statuses)

    groupLeadsByStatus([], statuses)

    expect(statuses).toEqual(snapshot)
  })
})
