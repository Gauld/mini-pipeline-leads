/**
 * Versión del texto legal mostrado en el formulario (casillas + información de privacidad).
 * Subirla cada vez que cambie ese texto: se guarda con cada lead para poder acreditar
 * qué leyó cuando consintió (RGPD art. 7.1).
 */
export const CONSENT_TEXT_VERSION = '2026-10-v2'

/**
 * Regla de negocio: las comunicaciones comerciales NO solicitadas (promociones, novedades) solo
 * se envían a quien las aceptó de forma explícita. Cerrado por defecto: cualquier valor distinto
 * de `true` deniega.
 *
 * El seguimiento de la solicitud que el propio lead hizo NO es comercial y no pasa por aquí
 * (ver D27). Hoy no hay envíos promocionales; esta regla es la que deberán usar cuando existan.
 */
export function canSendMarketing(lead: { consent_marketing?: boolean | null } | null | undefined): boolean {
  return lead?.consent_marketing === true
}
