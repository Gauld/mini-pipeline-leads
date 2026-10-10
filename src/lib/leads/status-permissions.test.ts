import { describe, expect, it } from 'vitest'
import {
  allowedTargetStatusIds,
  canChangeStatus,
  canManageEmail,
  canViewLeads,
  parseRole,
} from './status-permissions'

// Desordenados y con huecos en `position` a propósito: "siguiente" es la menor posición mayor.
const statuses = [
  { id: 'c', position: 30 },
  { id: 'a', position: 10 },
  { id: 'd', position: 40 },
  { id: 'b', position: 20 },
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
  it('admin: cualquier estado salvo el actual', () => {
    expect(allowedTargetStatusIds('admin', 'b', statuses).sort()).toEqual(['a', 'c', 'd'])
  })

  it('operador: solo el siguiente inmediato por posición', () => {
    expect(allowedTargetStatusIds('operator', 'a', statuses)).toEqual(['b'])
    expect(allowedTargetStatusIds('operator', 'b', statuses)).toEqual(['c'])
    expect(allowedTargetStatusIds('operator', 'c', statuses)).toEqual(['d'])
  })

  it('operador: en el último estado no hay siguiente', () => {
    expect(allowedTargetStatusIds('operator', 'd', statuses)).toEqual([])
  })

  it('sin rol: no puede cambiar nada', () => {
    expect(allowedTargetStatusIds(null, 'a', statuses)).toEqual([])
  })

  it('viewer: solo consulta, no puede cambiar ningún estado', () => {
    expect(allowedTargetStatusIds('viewer', 'a', statuses)).toEqual([])
    expect(allowedTargetStatusIds('viewer', 'b', statuses)).toEqual([])
  })

  it('estado actual desconocido: nadie puede cambiar (cerrado por defecto)', () => {
    expect(allowedTargetStatusIds('admin', 'zzz', statuses)).toEqual([])
    expect(allowedTargetStatusIds('operator', 'zzz', statuses)).toEqual([])
  })
})

describe('canChangeStatus', () => {
  it('admin puede ir hacia delante y hacia atrás, a cualquiera', () => {
    expect(canChangeStatus('admin', 'b', 'd', statuses)).toBe(true)
    expect(canChangeStatus('admin', 'c', 'a', statuses)).toBe(true)
  })

  it('operador puede avanzar solo al siguiente inmediato', () => {
    expect(canChangeStatus('operator', 'a', 'b', statuses)).toBe(true)
  })

  it('operador no puede saltar estados ni retroceder', () => {
    expect(canChangeStatus('operator', 'a', 'c', statuses)).toBe(false)
    expect(canChangeStatus('operator', 'a', 'd', statuses)).toBe(false)
    expect(canChangeStatus('operator', 'c', 'b', statuses)).toBe(false)
  })

  it('nadie puede "cambiar" al mismo estado ni a uno que no existe', () => {
    expect(canChangeStatus('admin', 'a', 'a', statuses)).toBe(false)
    expect(canChangeStatus('admin', 'a', 'zzz', statuses)).toBe(false)
    expect(canChangeStatus('operator', 'a', 'zzz', statuses)).toBe(false)
  })

  it('sin rol: denegado', () => {
    expect(canChangeStatus(null, 'a', 'b', statuses)).toBe(false)
  })

  it('viewer: denegado aunque sea el siguiente estado', () => {
    expect(canChangeStatus('viewer', 'a', 'b', statuses)).toBe(false)
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
