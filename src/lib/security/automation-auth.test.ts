import { describe, expect, it } from 'vitest'
import { isValidAutomationSecret } from './automation-auth'

describe('isValidAutomationSecret', () => {
  it('acepta el secreto correcto', () => {
    expect(isValidAutomationSecret('s3cret-value', 's3cret-value')).toBe(true)
  })

  it('rechaza un secreto distinto', () => {
    expect(isValidAutomationSecret('otro', 's3cret-value')).toBe(false)
  })

  it('rechaza si no se envía secreto', () => {
    expect(isValidAutomationSecret(null, 's3cret-value')).toBe(false)
    expect(isValidAutomationSecret('', 's3cret-value')).toBe(false)
  })

  it('rechaza SIEMPRE si el servidor no tiene secreto configurado', () => {
    expect(isValidAutomationSecret('', undefined)).toBe(false)
    expect(isValidAutomationSecret('x', '')).toBe(false)
    expect(isValidAutomationSecret(undefined as unknown as null, undefined)).toBe(false)
  })

  it('rechaza secretos de distinta longitud sin lanzar', () => {
    expect(isValidAutomationSecret('corto', 'mucho-mas-largo-que-el-otro')).toBe(false)
  })
})
