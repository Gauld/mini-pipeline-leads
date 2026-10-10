import { decryptSecret } from '../security/secret-box'
import { readEmailConfig, type SmtpConfig } from './send-email'

/** Fila de public.email_settings (la contraseña siempre cifrada). */
export interface EmailSettingsRow {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password_encrypted: string
  from_address: string | null
  from_name: string | null
  /** true = no se envía: los correos se registran como enviados sin salir. */
  simulate_sending: boolean
}

export interface EmailSettingsInput {
  host: string
  port: string | number
  user: string
  fromAddress: string
  fromName: string
}

export interface EmailSettingsValue {
  host: string
  port: number
  user: string
  fromAddress: string | null
  fromName: string
}

type Validation = { ok: true; value: EmailSettingsValue } | { ok: false; error: string }

const HAS_LINE_BREAK = /[\r\n]/
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmailSettings(input: EmailSettingsInput): Validation {
  const host = input.host.trim()
  const user = input.user.trim()
  const fromAddress = input.fromAddress.trim()
  const fromName = input.fromName.trim()
  const portText = String(input.port).trim()

  if ([host, user, fromAddress, fromName].some((v) => HAS_LINE_BREAK.test(v))) {
    return { ok: false, error: 'Los campos no pueden contener saltos de línea.' }
  }
  if (!host || host.length > 255) return { ok: false, error: 'El servidor SMTP es obligatorio.' }
  if (!user || user.length > 255) return { ok: false, error: 'El usuario es obligatorio.' }

  const port = Number(portText)
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
    return { ok: false, error: 'El puerto debe ser un número entre 1 y 65535.' }
  }
  if (fromAddress && !SIMPLE_EMAIL.test(fromAddress)) {
    return { ok: false, error: 'El remitente no es un email válido.' }
  }
  if (fromName.length > 100) return { ok: false, error: 'El nombre del remitente es demasiado largo.' }

  return { ok: true, value: { host, port, user, fromAddress: fromAddress || null, fromName } }
}

export function buildTestEmail(to: string) {
  return {
    to,
    subject: 'Email de prueba — configuración SMTP',
    text: 'Si recibes este mensaje, la cuenta de email está bien configurada.',
  }
}

/** Modo efectivo de envío: enviar con una cuenta, o simular (registrar sin enviar). */
export type EmailMode = { mode: 'send'; config: SmtpConfig } | { mode: 'simulate' }

/**
 * Decide si se envía o se simula:
 * - fila guardada con simulación activa -> simula (no hace falta descifrar nada);
 * - fila guardada sin simulación -> envía con ella (lanza si falta o falla la clave de cifrado);
 * - sin fila -> respaldo de SMTP_* del entorno si está completo; si no, simula.
 */
export function resolveEmailMode(
  row: EmailSettingsRow | null,
  env: Record<string, string | undefined>,
  encryptionKey: string | undefined
): EmailMode {
  if (row?.simulate_sending) return { mode: 'simulate' }
  const config = resolveEmailConfig(row, env, encryptionKey)
  return config ? { mode: 'send', config } : { mode: 'simulate' }
}

/**
 * La configuración de la base de datos manda; si no existe, se usan las variables
 * SMTP_* del entorno. Lanza si hay contraseña guardada y falta/falla la clave.
 */
export function resolveEmailConfig(
  row: EmailSettingsRow | null,
  env: Record<string, string | undefined>,
  encryptionKey: string | undefined
): SmtpConfig | null {
  if (!row) return readEmailConfig(env)

  if (!encryptionKey) {
    throw new Error('Falta SETTINGS_ENCRYPTION_KEY para descifrar la contraseña SMTP guardada.')
  }

  return {
    host: row.smtp_host,
    port: row.smtp_port,
    // 465 = TLS implícito; el resto exige STARTTLS (ver buildTransportOptions).
    secure: row.smtp_port === 465,
    user: row.smtp_user,
    pass: decryptSecret(row.smtp_password_encrypted, encryptionKey),
    fromAddress: row.from_address || row.smtp_user,
    fromName: row.from_name ?? '',
  }
}
