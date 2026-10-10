/**
 * Datos del responsable del tratamiento (RGPD art. 13) y titular del sitio (LSSI art. 10).
 *
 * MARCADORES: sustituir los valores entre corchetes por los reales antes de publicar.
 * No se inventan datos de ninguna empresa.
 */
export const LEGAL = {
  name: '[Razón social del responsable]',
  taxId: '[NIF/CIF]',
  address: '[Domicilio completo]',
  email: '[correo de contacto para privacidad y derechos]',
  registry: '[Datos de inscripción registral, si procede]',
  /** Plazo que se comunica al interesado. Debe coincidir con la política que se aplique de verdad. */
  retention: '[definir el plazo de conservación, p. ej. 24 meses desde la última interacción]',
  processors: [
    { name: 'Supabase', purpose: 'alojamiento de la base de datos y autenticación' },
    { name: 'Vercel', purpose: 'alojamiento de la aplicación web' },
    { name: '[Proveedor de correo SMTP]', purpose: 'envío de los correos electrónicos' },
  ],
} as const
