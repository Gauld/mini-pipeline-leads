import { describe, expect, it } from 'vitest'
import { missingEnv } from './check-env'

const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
}

const PROD_EXTRA = {
  RATE_LIMIT_SALT: 'salt',
  TURNSTILE_SECRET_KEY: 'ts',
  AUTOMATION_SECRET: 'auto',
  SETTINGS_ENCRYPTION_KEY: 'enc',
}

describe('missingEnv', () => {
  it('no reporta nada si están las obligatorias en desarrollo', () => {
    expect(missingEnv({ ...BASE, NODE_ENV: 'development' })).toEqual([])
  })

  it('detecta la service role que faltaba', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omit, ...env } = BASE
    expect(missingEnv({ ...env, NODE_ENV: 'development' })).toEqual(['SUPABASE_SERVICE_ROLE_KEY'])
  })

  it('trata vacío o solo espacios como ausente', () => {
    expect(missingEnv({ ...BASE, SUPABASE_SERVICE_ROLE_KEY: '   ', NODE_ENV: 'development' })).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
  })

  it('en producción exige además sal, turnstile, automatización y cifrado', () => {
    expect(missingEnv({ ...BASE, NODE_ENV: 'production' })).toEqual(Object.keys(PROD_EXTRA))
    expect(missingEnv({ ...BASE, ...PROD_EXTRA, NODE_ENV: 'production' })).toEqual([])
  })

  it('en desarrollo no exige las de producción', () => {
    expect(missingEnv({ ...BASE, NODE_ENV: 'development' })).not.toContain('RATE_LIMIT_SALT')
  })
})
