import { z } from 'zod'

// Validación del formulario público. Función pura: el catálogo de
// oposiciones llega como argumento para no acoplarla a Supabase.

const MAX_NAME = 120
const MAX_EMAIL = 254
const MAX_OTHER = 100
const OTHER_OPTION = 'Otros'

// Sin caracteres de control (saltos de línea: inyección de cabeceras) ni ángulos (HTML).
const SAFE_TEXT = /^[^\u0000-\u001F\u007F<>]+$/
const PHONE_CHARS = /^\+?[0-9 ()-]+$/

const required = (label: string) => ({ error: `${label} es obligatorio.` })

const phone = z
  .string(required('El teléfono'))
  .trim()
  .max(20, 'El teléfono es demasiado largo.')
  .regex(PHONE_CHARS, 'Teléfono no válido.')
  .refine((v) => {
    const digits = v.replace(/\D/g, '').length
    return digits >= 7 && digits <= 15
  }, 'Teléfono no válido.')

// Un solo destinatario: nada de comas, punto y coma, espacios ni ángulos (Nodemailer
// aceptaría varias direcciones en `to`).
const email = z
  .string(required('El correo'))
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL, 'El correo es demasiado largo.')
  .refine((v) => !/[,;\s<>]/.test(v), 'Indica un solo correo electrónico.')
  .pipe(z.email('Correo electrónico no válido.'))

export interface LeadData {
  full_name: string
  email: string
  phone: string
  target_opposition: string
  /** Consentimiento comercial (opcional, nunca premarcado). La privacidad se exige, no se guarda como booleano. */
  consent_marketing: boolean
}

// Un <input type="checkbox"> marcado envía "on"; ausente no envía nada. Coincidencia exacta.
const isChecked = (v: string | undefined) => v === 'on' || v === 'true'

export type ParseLeadResult =
  | { success: true; data: LeadData }
  | { success: false; fieldErrors: Partial<Record<string, string[]>> }

function buildLeadSchema(catalog: string[]) {
  const allowed = new Set(catalog)

  return z
    .object({
      full_name: z
        .string(required('El nombre'))
        .trim()
        .min(2, 'El nombre es demasiado corto.')
        .max(MAX_NAME, 'El nombre es demasiado largo.')
        .regex(SAFE_TEXT, 'El nombre contiene caracteres no permitidos.'),
      email,
      phone,
      target_opposition: z
        .string(required('La oposición'))
        .trim()
        .refine((v) => v === OTHER_OPTION || allowed.has(v), 'Selecciona una oposición de la lista.'),
      // Solo se valida si se elige "Otros"; si no, se ignora.
      other_target_opposition: z.string().optional().catch(undefined),
      // Información y consentimiento: son casillas SEPARADAS.
      accept_privacy: z
        .string(required('Aceptar la política de privacidad'))
        .refine(isChecked, 'Debes aceptar la política de privacidad para continuar.'),
      consent_marketing: z.string().optional().catch(undefined).transform(isChecked),
    })
    .superRefine((d, ctx) => {
      if (d.target_opposition !== OTHER_OPTION) return
      const other = (d.other_target_opposition ?? '').trim()
      const fail = (message: string) =>
        ctx.addIssue({ code: 'custom', path: ['other_target_opposition'], message })

      if (!other) return fail('Especifica la oposición de tu interés.')
      if (other.length > MAX_OTHER) return fail(`Máximo ${MAX_OTHER} caracteres.`)
      if (!SAFE_TEXT.test(other)) return fail('Contiene caracteres no permitidos.')
    })
    .transform(
      (d): LeadData => ({
        full_name: d.full_name,
        email: d.email,
        phone: d.phone,
        target_opposition:
          d.target_opposition === OTHER_OPTION
            ? `${OTHER_OPTION}: ${(d.other_target_opposition ?? '').trim()}`
            : d.target_opposition,
        consent_marketing: d.consent_marketing,
      })
    )
}

/** Valida y normaliza la entrada del formulario. `catalog` = nombres de oposiciones activas. */
export function parseLead(input: unknown, catalog: string[]): ParseLeadResult {
  const result = buildLeadSchema(catalog).safeParse(input)
  if (result.success) return { success: true, data: result.data }
  return { success: false, fieldErrors: z.flattenError(result.error).fieldErrors }
}
