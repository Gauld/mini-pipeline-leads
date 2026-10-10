import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './secret-box'

const key = randomBytes(32).toString('base64')

describe('secret-box', () => {
  it('descifra lo que cifró', () => {
    expect(decryptSecret(encryptSecret('mi-clave', key), key)).toBe('mi-clave')
  })

  it('no guarda el texto en claro', () => {
    expect(encryptSecret('mi-clave', key)).not.toContain('mi-clave')
  })

  it('cifrar dos veces el mismo texto da resultados distintos (IV aleatorio)', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key))
  })

  it('falla con otra clave', () => {
    const other = randomBytes(32).toString('base64')
    expect(() => decryptSecret(encryptSecret('x', key), other)).toThrow()
  })

  it('detecta datos manipulados (autenticación GCM)', () => {
    const [v, iv, tag, data] = encryptSecret('hola', key).split(':')
    const tampered = [v, iv, tag, Buffer.from('otra-cosa').toString('base64')].join(':')
    expect(() => decryptSecret(tampered, key)).toThrow()
  })

  it('rechaza claves que no son de 32 bytes', () => {
    expect(() => encryptSecret('x', Buffer.from('corta').toString('base64'))).toThrow(/32 bytes/)
    expect(() => encryptSecret('x', '')).toThrow()
  })

  it('rechaza un formato desconocido', () => {
    expect(() => decryptSecret('basura', key)).toThrow()
  })
})
