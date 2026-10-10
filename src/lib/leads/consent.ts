/**
 * Versión del texto legal mostrado en el formulario (casillas + información de privacidad).
 * Subirla cada vez que cambie ese texto: se guarda con cada lead para poder acreditar
 * qué leyó cuando consintió (RGPD art. 7.1).
 */
export const CONSENT_TEXT_VERSION = '2026-10-v1'

/**
 * Regla de negocio: el seguimiento comercial solo se envía a quien lo aceptó de forma
 * explícita. Cerrado por defecto: cualquier valor distinto de `true` deniega.
 */
export function canSendMarketing(lead: { consent_marketing?: boolean | null } | null | undefined): boolean {
  return lead?.consent_marketing === true
}
