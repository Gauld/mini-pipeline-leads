import { describe, expect, it } from 'vitest'
import {
  allowedTargetStatusIds,
  canChangeStatus,
  canManageEmail,
  canViewLeads,
  parseRole,
} from './status-permissions'

// Flujo con bifurcación: a -> b -> c -> (d | e). d y e son finales.
const statuses = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]
const transitions = [
  { from_status_id: 'a', to_status_id: 'b' },
  { from_status_id: 'b', to_status_id: 'c' },
  { from_status_id: 'c', to_status_id: 'd' },
  { from_status_id: 'c', to_status_id: 'e' },
]

describe('parseRole', () => {
  it('acepta solo los roles conocidos', () => {
    expect(parseRole('admin')).toBe('admin')
    expect(parseRole('operator')).toBe('operator')
    expect(parseRole('viewer')).toBe('viewer')
  })

  it('cerrado por defecto: cualquier otra cosa no es un rol', () => {
    expect(parseRole(null)).toBeNull()
    expect(parseRole(undefined)).toBeNull()
    expect(parseRole('')).toBeNull()
    expect(parseRole('ADMIN')).toBeNull()
    expect(parseRole('superadmin')).toBeNull()
    expect(parseRole(1)).toBeNull()
  })
})

describe('allowedTargetStatusIds', () => {
  it('admin: cualquier estado salvo el actual, sin mirar las transiciones', () => {
    expect(allowedTargetStatusIds('admin', 'b', statuses, transitions).sort()).toEqual(['a', 'c', 'd', 'e'])
    expect(allowedTargetStatusIds('admin', 'b', statuses, []).sort()).toEqual(['a', 'c', 'd', 'e'])
  })

  it('operador: solo los destinos definidos en las transiciones desde su estado', () => {
    expect(allowedTargetStatusIds('operator', 'a', statuses, transitions)).toEqual(['b'])
    expect(allowedTargetStatusIds('operator', 'b', statuses, transitions)).toEqual(['c'])
  })

  it('operador: un estado con bifurcación permite todos sus destinos', () => {
    expect(allowedTargetStatusIds('operator', 'c', statuses, transitions).sort()).toEqual(['d', 'e'])
  })

  it('operador: en un estado final no hay destinos', () => {
    expect(allowedTargetStatusIds('operator', 'd', statuses, transitions)).toEqual([])
    expect(allowedTargetStatusIds('operator', 'e', statuses, transitions)).toEqual([])
  })

  it('operador: sin transiciones definidas no puede mover nada (cerrado por defecto)', () => {
    expect(allowedTargetStatusIds('operator', 'a', statuses, [])).toEqual([])
  })

  it('operador: ignora transiciones hacia estados que ya no existen', () => {
    const withGhost = [...transitions, { from_status_id: 'a', to_status_id: 'zzz' }]
    expect(allowedTargetStatusIds('operator', 'a', statuses, withGhost)).toEqual(['b'])
  })

  it('operador: no incluye el estado actual aunque haya una transición a sí mismo', () => {
    const self = [{ from_status_id: 'a', to_status_id: 'a' }]
    expect(allowedTargetStatusIds('operator', 'a', statuses, self)).toEqual([])
  })

  it('sin rol: no puede cambiar nada', () => {
    expect(allowedTargetStatusIds(null, 'a', statuses, transitions)).toEqual([])
  })

  it('viewer: solo consulta, no puede cambiar ningún estado', () => {
    expect(allowedTargetStatusIds('viewer', 'a', statuses, transitions)).toEqual([])
    expect(allowedTargetStatusIds('viewer', 'c', statuses, transitions)).toEqual([])
  })

  it('estado actual desconocido: nadie puede cambiar (cerrado por defecto)', () => {
    expect(allowedTargetStatusIds('admin', 'zzz', statuses, transitions)).toEqual([])
    expect(allowedTargetStatusIds('operator', 'zzz', statuses, transitions)).toEqual([])
  })
})

describe('canChangeStatus', () => {
  it('admin puede ir hacia delante y hacia atrás, a cualquiera', () => {
    expect(canChangeStatus('admin', 'b', 'e', statuses, transitions)).toBe(true)
    expect(canChangeStatus('admin', 'd', 'a', statuses, transitions)).toBe(true)
  })

  it('operador puede seguir una transición definida', () => {
    expect(canChangeStatus('operator', 'a', 'b', statuses, transitions)).toBe(true)
  })

  it('operador puede elegir cualquiera de los destinos de una bifurcación', () => {
    expect(canChangeStatus('operator', 'c', 'd', statuses, transitions)).toBe(true)
    expect(canChangeStatus('operator', 'c', 'e', statuses, transitions)).toBe(true)
  })

  it('operador no puede saltar estados, retroceder ni cambiar entre finales', () => {
    expect(canChangeStatus('operator', 'a', 'c', statuses, transitions)).toBe(false)
    expect(canChangeStatus('operator', 'c', 'b', statuses, transitions)).toBe(false)
    expect(canChangeStatus('operator', 'd', 'e', statuses, transitions)).toBe(false)
  })

  it('nadie puede "cambiar" al mismo estado ni a uno que no existe', () => {
    expect(canChangeStatus('admin', 'a', 'a', statuses, transitions)).toBe(false)
    expect(canChangeStatus('admin', 'a', 'zzz', statuses, transitions)).toBe(false)
    expect(canChangeStatus('operator', 'a', 'zzz', statuses, transitions)).toBe(false)
  })

  it('sin rol y viewer: denegado aunque la transición exista', () => {
    expect(canChangeStatus(null, 'a', 'b', statuses, transitions)).toBe(false)
    expect(canChangeStatus('viewer', 'a', 'b', statuses, transitions)).toBe(false)
  })
})

describe('canViewLeads', () => {
  it('cualquier rol conocido puede consultar', () => {
    expect(canViewLeads('admin')).toBe(true)
    expect(canViewLeads('operator')).toBe(true)
    expect(canViewLeads('viewer')).toBe(true)
  })

  it('sin rol no tiene ningún permiso, tampoco de consulta', () => {
    expect(canViewLeads(null)).toBe(false)
  })
})

describe('canManageEmail (seguimiento, plantillas y configuración de email)', () => {
  it('admin y operator pueden', () => {
    expect(canManageEmail('admin')).toBe(true)
    expect(canManageEmail('operator')).toBe(true)
  })

  it('viewer y sin rol no pueden', () => {
    expect(canManageEmail('viewer')).toBe(false)
    expect(canManageEmail(null)).toBe(false)
  })
})
