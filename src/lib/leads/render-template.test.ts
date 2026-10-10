import { describe, expect, it } from 'vitest'
import { renderTemplate, TEMPLATE_VARIABLES } from './render-template'

const vars = { nombre: 'Ana Pérez', oposicion: 'Auxiliar Administrativo' }

describe('renderTemplate', () => {
  it('reemplaza {{nombre}} y {{oposicion}}', () => {
    expect(renderTemplate('Hola {{nombre}}, sobre {{oposicion}}', vars)).toBe(
      'Hola Ana Pérez, sobre Auxiliar Administrativo'
    )
  })

  it('reemplaza todas las apariciones', () => {
    expect(renderTemplate('{{nombre}} {{nombre}}', vars)).toBe('Ana Pérez Ana Pérez')
  })

  it('tolera espacios dentro de las llaves', () => {
    expect(renderTemplate('Hola {{ nombre }}', vars)).toBe('Hola Ana Pérez')
  })

  it('deja intactas las variables desconocidas', () => {
    expect(renderTemplate('Hola {{otra}}', vars)).toBe('Hola {{otra}}')
  })

  it('no interpreta $ del valor como patrón de reemplazo', () => {
    expect(renderTemplate('{{nombre}}', { ...vars, nombre: '$& $1' })).toBe('$& $1')
  })

  it('expone las variables disponibles para el editor', () => {
    expect(TEMPLATE_VARIABLES.map((v) => v.key)).toEqual(['nombre', 'oposicion'])
  })
})
