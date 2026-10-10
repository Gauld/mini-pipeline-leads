import { timingSafeEqual } from 'node:crypto'

/**
 * Compara el secreto recibido con el configurado en tiempo constante.
 * Sin secreto configurado en el servidor SIEMPRE rechaza (nunca "abierto por defecto").
 */
export function isValidAutomationSecret(
  provided: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!expected || !provided) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}
