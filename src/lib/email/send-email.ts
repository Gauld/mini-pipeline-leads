import { isIP } from 'node:net'
import nodemailer from 'nodemailer'
import { allowInternalSmtp, resolveSafeSmtpTarget } from '../security/safe-smtp-target'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromAddress: string
  fromName: string
}

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
}

interface MailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>
}

type EnvLike = Record<string, string | undefined>

const DEFAULT_PORT = 587
const SINGLE_RECIPIENT = /^[^\s,;<>"()[\]\\@]+@[^\s,;<>"()[\]\\@]+$/

/**
 * Lee la cuenta SMTP del entorno (cualquier proveedor). Devuelve null si falta
 * host, usuario o contraseña.
 *
 * Gmail: smtp.gmail.com, puerto 465 (o 587) y contraseña de aplicación.
 */
export function readEmailConfig(env: EnvLike = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim()
  const user = env.SMTP_USER?.trim()
  // Google muestra las contraseñas de aplicación en grupos separados por espacios.
  const pass = env.SMTP_PASSWORD?.replace(/\s+/g, '')
  if (!host || !user || !pass) return null

  const parsedPort = Number.parseInt(env.SMTP_PORT ?? '', 10)
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT
  // 465 = TLS implícito; 587 = STARTTLS (secure:false y nodemailer negocia TLS).
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE.trim().toLowerCase() === 'true' : port === 465

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromAddress: env.EMAIL_FROM?.trim() || user,
    fromName: env.EMAIL_FROM_NAME?.trim() ?? '',
  }
}

/**
 * Siempre cifrado: con 465 el TLS es implícito; con otros puertos se exige STARTTLS
 * (`requireTLS`). Sin esa opción, Nodemailer envía en claro si el servidor no lo ofrece.
 */
export function buildTransportOptions(config: SmtpConfig, pinnedAddress?: string) {
  return {
    // Con IP fijada se conecta a esa IP (la ya validada) y no se vuelve a resolver el nombre:
    // evita el DNS rebinding. El certificado se valida contra el NOMBRE.
    host: pinnedAddress ?? config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.pass },
    // Node no admite una IP como servername (RFC 6066).
    ...(pinnedAddress && !isIP(config.host) ? { tls: { servername: config.host } } : {}),
  }
}

export function createEmailSender(
  transport: MailTransport,
  from: Pick<SmtpConfig, 'fromAddress'> & Partial<Pick<SmtpConfig, 'fromName'>>
) {
  const sender = from.fromName
    ? `"${from.fromName.replace(/"/g, '')}" <${from.fromAddress}>`
    : from.fromAddress

  return async function send(
    email: OutgoingEmail
  ): Promise<{ success: true } | { success: false; error: string }> {
    // Nodemailer acepta varias direcciones en `to`: un único destinatario, sin separadores,
    // espacios, saltos de línea ni formato "Nombre <dir>".
    if (!SINGLE_RECIPIENT.test(email.to)) {
      return { success: false, error: 'Destinatario no válido.' }
    }

    try {
      await transport.sendMail({ from: sender, to: email.to, subject: email.subject, text: email.text })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  }
}

/**
 * Envía con la cuenta SMTP indicada (servidor únicamente). Antes de conectar valida el destino
 * (puerto SMTP estándar, sin IPs internas) y conecta a la IP ya validada.
 */
export async function sendEmail(email: OutgoingEmail, config: SmtpConfig) {
  const target = await resolveSafeSmtpTarget(config.host, config.port, { allowInternal: allowInternalSmtp() })
  if (!target.ok) return { success: false as const, error: target.error }

  const transport = nodemailer.createTransport(buildTransportOptions(config, target.address))

  return createEmailSender(transport, config)(email)
}
