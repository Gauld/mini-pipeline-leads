import { describe, expect, it } from 'vitest'
import { canSendMarketing, CONSENT_TEXT_VERSION } from './consent'

describe('canSendMarketing', () => {
  it('permite el seguimiento solo si hay consentimiento comercial explícito', () => {
    expect(canSendMarketing({ consent_marketing: true })).toBe(true)
  })

  it('lo bloquea si no consintió', () => {
    expect(canSendMarketing({ consent_marketing: false })).toBe(false)
  })

  it('cerrado por defecto: ausente, nulo o no booleano deniega', () => {
    expect(canSendMarketing(null)).toBe(false)
    expect(canSendMarketing(undefined)).toBe(false)
    expect(canSendMarketing({})).toBe(false)
    expect(canSendMarketing({ consent_marketing: null })).toBe(false)
    expect(canSendMarketing({ consent_marketing: 'true' as unknown as boolean })).toBe(false)
    expect(canSendMarketing({ consent_marketing: 1 as unknown as boolean })).toBe(false)
  })
})

describe('CONSENT_TEXT_VERSION', () => {
  it('es un identificador no vacío para poder acreditar qué texto se mostró', () => {
    expect(CONSENT_TEXT_VERSION.trim().length).toBeGreaterThan(0)
  })
})
