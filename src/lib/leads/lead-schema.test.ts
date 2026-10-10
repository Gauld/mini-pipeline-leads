import { describe, expect, it } from 'vitest'
import { parseLead } from './lead-schema'

const CATALOG = ['Auxiliar Administrativo', 'Policía Nacional']

const valid = {
  full_name: 'Juan Pérez',
  email: 'juan@ejemplo.com',
  phone: '+34 600 000 000',
  target_opposition: 'Policía Nacional',
  accept_privacy: 'on', // valor que envía un <input type="checkbox"> marcado
}

// Lo que se guarda: sin accept_privacy (su prueba es consent_privacy_at, que pone el servidor).
const expected = {
  full_name: 'Juan Pérez',
  email: 'juan@ejemplo.com',
  phone: '+34 600 000 000',
  target_opposition: 'Policía Nacional',
  consent_marketing: false,
}

const fieldsOf = (r: ReturnType<typeof parseLead>) => (r.success ? [] : Object.keys(r.fieldErrors))

describe('parseLead — caso válido', () => {
  it('acepta un lead correcto y devuelve solo los campos que se guardan', () => {
    const r = parseLead(valid, CATALOG)
    expect(r).toEqual({ success: true, data: expected })
  })

  it('normaliza: recorta espacios y pasa el email a minúsculas', () => {
    const r = parseLead({ ...valid, full_name: '  Juan Pérez  ', email: '  Juan@Ejemplo.COM ' }, CATALOG)
    expect(r.success && r.data.full_name).toBe('Juan Pérez')
    expect(r.success && r.data.email).toBe('juan@ejemplo.com')
  })
})

describe('parseLead — email (inyección de destinatarios)', () => {
  it.each([
    ['varios con coma', 'a@x.com,b@y.com'],
    ['varios con coma y espacio', 'a@x.com, b@y.com'],
    ['varios con punto y coma', 'a@x.com;b@y.com'],
    ['salto de línea (cabecera Bcc)', 'a@x.com\nBcc: b@y.com'],
    ['con espacios', 'a @x.com'],
    ['sin dominio', 'a@'],
    ['sin arroba', 'ejemplo.com'],
    ['con ángulos', 'Nombre <a@x.com>'],
    ['vacío', ''],
  ])('rechaza %s', (_label, email) => {
    expect(fieldsOf(parseLead({ ...valid, email }, CATALOG))).toContain('email')
  })

  it('rechaza más de 254 caracteres', () => {
    const email = `${'a'.repeat(250)}@x.com`
    expect(fieldsOf(parseLead({ ...valid, email }, CATALOG))).toContain('email')
  })
})

describe('parseLead — nombre', () => {
  it.each([
    ['demasiado corto', 'J'],
    ['solo espacios', '    '],
    ['con salto de línea', 'Juan\nPérez'],
    ['con etiquetas', 'Juan <script>'],
    ['más de 120 caracteres', 'a'.repeat(121)],
  ])('rechaza nombre %s', (_label, full_name) => {
    expect(fieldsOf(parseLead({ ...valid, full_name }, CATALOG))).toContain('full_name')
  })

  it('acepta tildes, apóstrofos y guiones', () => {
    expect(parseLead({ ...valid, full_name: "María-José O'Brien Ñandú" }, CATALOG).success).toBe(true)
  })
})

describe('parseLead — teléfono', () => {
  it.each(['+34 600 000 000', '600000000', '(91) 123-4567', '+44 20 7946 0958'])('acepta %s', (phone) => {
    expect(parseLead({ ...valid, phone }, CATALOG).success).toBe(true)
  })

  it.each([
    ['letras', 'abcdefghij'],
    ['demasiado corto', '12345'],
    ['demasiado largo', '1'.repeat(21)],
    ['con salto de línea', '600000000\n1'],
    ['inyección', '600000000;DROP'],
  ])('rechaza %s', (_label, phone) => {
    expect(fieldsOf(parseLead({ ...valid, phone }, CATALOG))).toContain('phone')
  })
})

describe('parseLead — oposición del catálogo', () => {
  it('acepta una oposición del catálogo', () => {
    expect(parseLead({ ...valid, target_opposition: 'Auxiliar Administrativo' }, CATALOG).success).toBe(true)
  })

  it('rechaza una oposición que no está en el catálogo', () => {
    expect(fieldsOf(parseLead({ ...valid, target_opposition: 'Inventada' }, CATALOG))).toContain('target_opposition')
  })

  it('ignora other_target_opposition si se eligió una del catálogo', () => {
    const r = parseLead({ ...valid, other_target_opposition: 'loquesea' }, CATALOG)
    expect(r).toEqual({ success: true, data: expected })
  })
})

describe('parseLead — caso "Otros"', () => {
  const otros = { ...valid, target_opposition: 'Otros' }

  it('guarda "Otros: <texto>" cuando se especifica', () => {
    const r = parseLead({ ...otros, other_target_opposition: '  Auxiliar de Biblioteca ' }, CATALOG)
    expect(r.success && r.data.target_opposition).toBe('Otros: Auxiliar de Biblioteca')
    expect(r.success && 'other_target_opposition' in r.data).toBe(false)
  })

  it.each([
    ['ausente', undefined],
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('exige el texto: %s', (_label, other_target_opposition) => {
    const r = parseLead({ ...otros, other_target_opposition }, CATALOG)
    expect(fieldsOf(r)).toContain('other_target_opposition')
  })

  it.each([
    ['más de 100 caracteres', 'a'.repeat(101)],
    ['con salto de línea', 'Auxiliar\nBcc: x@y.com'],
    ['con etiquetas', '<img src=x>'],
  ])('rechaza el texto %s', (_label, other_target_opposition) => {
    const r = parseLead({ ...otros, other_target_opposition }, CATALOG)
    expect(fieldsOf(r)).toContain('other_target_opposition')
  })

  it('funciona aunque el catálogo esté vacío', () => {
    const r = parseLead({ ...otros, other_target_opposition: 'Otra' }, [])
    expect(r.success && r.data.target_opposition).toBe('Otros: Otra')
  })

  it('el valor final nunca supera los 150 caracteres que admite la base', () => {
    const r = parseLead({ ...otros, other_target_opposition: 'a'.repeat(100) }, CATALOG)
    expect(r.success && r.data.target_opposition.length).toBeLessThanOrEqual(150)
  })
})

describe('parseLead — consentimiento', () => {
  it('exige aceptar la política de privacidad', () => {
    const { accept_privacy: _omitted, ...sinAceptar } = valid
    expect(fieldsOf(parseLead(sinAceptar, CATALOG))).toContain('accept_privacy')
  })

  it.each(['', 'off', 'false', '0', 'no', 'ON ', 'yes'])('rechaza accept_privacy = %j', (accept_privacy) => {
    expect(fieldsOf(parseLead({ ...valid, accept_privacy }, CATALOG))).toContain('accept_privacy')
  })

  it.each(['on', 'true'])('acepta accept_privacy = %j', (accept_privacy) => {
    expect(parseLead({ ...valid, accept_privacy }, CATALOG).success).toBe(true)
  })

  it('el marketing es OPCIONAL y por defecto false (nunca premarcado)', () => {
    const r = parseLead(valid, CATALOG)
    expect(r.success && r.data.consent_marketing).toBe(false)
  })

  it.each(['on', 'true'])('consent_marketing = %j se interpreta como true', (consent_marketing) => {
    const r = parseLead({ ...valid, consent_marketing }, CATALOG)
    expect(r.success && r.data.consent_marketing).toBe(true)
  })

  it.each(['', 'off', 'false', 'cualquier cosa'])('consent_marketing = %j se interpreta como false', (consent_marketing) => {
    const r = parseLead({ ...valid, consent_marketing }, CATALOG)
    expect(r.success && r.data.consent_marketing).toBe(false)
  })

  it('aceptar la privacidad NO implica aceptar el marketing (consentimientos separados)', () => {
    const r = parseLead({ ...valid, accept_privacy: 'on' }, CATALOG)
    expect(r.success && r.data.consent_marketing).toBe(false)
  })
})

describe('parseLead — entradas hostiles', () => {
  it('rechaza campos obligatorios ausentes', () => {
    expect(fieldsOf(parseLead({}, CATALOG)).sort()).toEqual(
      ['accept_privacy', 'email', 'full_name', 'phone', 'target_opposition'].sort()
    )
  })

  it('rechaza valores que no son texto (p. ej. un File de FormData)', () => {
    const r = parseLead({ ...valid, full_name: new Blob(['x']), phone: null, email: 42 }, CATALOG)
    expect(fieldsOf(r)).toEqual(expect.arrayContaining(['full_name', 'phone', 'email']))
  })

  it('rechaza una entrada que ni siquiera es un objeto', () => {
    expect(parseLead(null, CATALOG).success).toBe(false)
    expect(parseLead('texto', CATALOG).success).toBe(false)
  })

  it('descarta campos desconocidos (p. ej. intentar fijar status_id)', () => {
    const r = parseLead({ ...valid, status_id: 'x', id: 'y' }, CATALOG)
    expect(r).toEqual({ success: true, data: expected })
  })

  it('devuelve mensajes en español por campo', () => {
    const r = parseLead({ ...valid, email: 'mal' }, CATALOG)
    expect(!r.success && r.fieldErrors.email?.[0]).toMatch(/correo|email/i)
  })
})
