import { describe, expect, it } from 'vitest'
import type { Lead } from '@/types'
import { filterLeads } from './filter-leads'

const lead = (id: string, overrides: Partial<Lead> = {}): Lead => ({
  id,
  created_at: '2026-01-01T00:00:00Z',
  full_name: `Lead ${id}`,
  email: `${id}@ejemplo.com`,
  phone: '600000000',
  target_opposition: 'Auxiliar Administrativo',
  status_id: 'a',
  ...overrides,
})

const ids = (leads: Lead[]) => leads.map((l) => l.id)

describe('filterLeads', () => {
  it('sin filtros devuelve todos los leads', () => {
    const leads = [lead('1'), lead('2')]

    expect(ids(filterLeads(leads, {}))).toEqual(['1', '2'])
  })

  it('ignora filtros vacíos o con solo espacios', () => {
    const leads = [lead('1'), lead('2')]

    expect(ids(filterLeads(leads, { name: '  ', email: '', phone: ' ', statusId: '' }))).toEqual([
      '1',
      '2',
    ])
  })

  it('filtra por estado exacto', () => {
    const leads = [lead('1', { status_id: 'a' }), lead('2', { status_id: 'b' })]

    expect(ids(filterLeads(leads, { statusId: 'b' }))).toEqual(['2'])
  })

  it('filtra por nombre ignorando mayúsculas y tildes', () => {
    const leads = [lead('1', { full_name: 'José Pérez' }), lead('2', { full_name: 'Ana Ruiz' })]

    expect(ids(filterLeads(leads, { name: 'jose perez' }))).toEqual(['1'])
  })

  it('filtra por correo con coincidencia parcial', () => {
    const leads = [lead('1', { email: 'ana@gmail.com' }), lead('2', { email: 'luis@outlook.com' })]

    expect(ids(filterLeads(leads, { email: 'GMAIL' }))).toEqual(['1'])
  })

  it('filtra por teléfono ignorando espacios y guiones', () => {
    const leads = [lead('1', { phone: '600 123 456' }), lead('2', { phone: '699-000-111' })]

    expect(ids(filterLeads(leads, { phone: '600123' }))).toEqual(['1'])
    expect(ids(filterLeads(leads, { phone: '699 000' }))).toEqual(['2'])
  })

  it('combina filtros con AND', () => {
    const leads = [
      lead('1', { full_name: 'Ana', status_id: 'a' }),
      lead('2', { full_name: 'Ana', status_id: 'b' }),
      lead('3', { full_name: 'Luis', status_id: 'b' }),
    ]

    expect(ids(filterLeads(leads, { name: 'ana', statusId: 'b' }))).toEqual(['2'])
  })

  it('conserva el orden de entrada y no muta el array', () => {
    const leads = [lead('z'), lead('m'), lead('b')]
    const snapshot = structuredClone(leads)

    expect(ids(filterLeads(leads, {}))).toEqual(['z', 'm', 'b'])
    expect(leads).toEqual(snapshot)
  })
})
