import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Anti-SSRF para la cuenta SMTP configurable: el servidor abre una conexión a
// un host que elige un usuario, así que se valida ANTES de conectar a dónde va realmente.

export const ALLOWED_SMTP_PORTS = [25, 465, 587, 2525] as const

type Resolver = (host: string) => Promise<string[]>

const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((r) => r.address)

const FORBIDDEN_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa']

/** Nombres que apuntan a la propia máquina o a redes internas. */
export function isForbiddenHostname(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '')
  if (!h || h === 'localhost') return true
  return FORBIDDEN_SUFFIXES.some((suffix) => h.endsWith(suffix))
}

function isPrivateIPv4(a: number, b: number, c: number): boolean {
  return (
    a === 0 || // "esta red"
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local (metadatos cloud)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // pruebas de rendimiento
    a >= 224 // multicast, reservado y broadcast
  )
}

/** Expande una IPv6 a 8 grupos de 16 bits; null si no se puede interpretar. */
function expandIPv6(ip: string): number[] | null {
  let text = ip.split('%')[0]
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (tail) {
    const [, a, b, c, d] = tail.map(Number)
    text = text.slice(0, tail.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16)
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest].map((g) =>
    Number.parseInt(g, 16)
  )
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}

/**
 * ¿Es una dirección interna, reservada o no válida? Cerrado por defecto: lo que no se pueda
 * interpretar como IP se considera NO seguro.
 */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)

  if (version === 4) {
    const [a, b, c] = ip.split('.').map(Number)
    return isPrivateIPv4(a, b, c)
  }

  if (version === 6) {
    const g = expandIPv6(ip)
    if (!g) return true
    if (g.every((x) => x === 0)) return true // ::
    const v4 = (hi: number, lo: number) => isPrivateIPv4(hi >> 8, hi & 255, lo >> 8)
    // IPv4 mapeada (::ffff:a.b.c.d), compatible (::a.b.c.d) y NAT64 (64:ff9b::/96).
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4(g[6], g[7])
    if (g.slice(0, 6).every((x) => x === 0)) return true // ::1, ::a.b.c.d
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4(g[6], g[7])
    if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 (privada única)
    if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 (link-local)
    if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 (multicast)
    return false
  }

  return true
}

/** Permitir destinos internos (p. ej. un SMTP local) SOLO fuera de producción y de forma explícita. */
export function allowInternalSmtp(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.SMTP_ALLOW_INTERNAL === 'true'
}

export type SmtpTargetResult = { ok: true; address: string } | { ok: false; error: string }

interface TargetOptions {
  resolver?: Resolver
  /** SOLO desarrollo (p. ej. un servidor SMTP local): desactiva todas las comprobaciones. */
  allowInternal?: boolean
}

/**
 * Comprueba que el servidor SMTP es un destino admisible y devuelve la IP RESUELTA.
 * Quien conecte debe usar esa IP (no volver a resolver el nombre) para evitar *DNS rebinding*:
 * que el DNS responda una IP pública al validar y otra interna al conectar.
 */
export async function resolveSafeSmtpTarget(
  host: string,
  port: number,
  { resolver = defaultResolver, allowInternal = false }: TargetOptions = {}
): Promise<SmtpTargetResult> {
  const name = host.trim()

  if (!allowInternal && !(ALLOWED_SMTP_PORTS as readonly number[]).includes(port)) {
    return { ok: false, error: `Puerto no permitido. Usa ${ALLOWED_SMTP_PORTS.join(', ')}.` }
  }

  if (isIP(name)) {
    if (!allowInternal && isPrivateAddress(name)) {
      return { ok: false, error: 'El servidor SMTP no puede ser una dirección interna.' }
    }
    return { ok: true, address: name }
  }

  if (!allowInternal && isForbiddenHostname(name)) {
    return { ok: false, error: 'El servidor SMTP no puede ser un nombre interno.' }
  }

  let addresses: string[]
  try {
    addresses = await resolver(name)
  } catch {
    return { ok: false, error: 'No se pudo resolver el servidor SMTP.' }
  }
  if (addresses.length === 0) return { ok: false, error: 'No se pudo resolver el servidor SMTP.' }

  // Basta una dirección interna para rechazar: el cliente podría terminar usándola.
  if (!allowInternal && addresses.some(isPrivateAddress)) {
    return { ok: false, error: 'El servidor SMTP resuelve a una dirección interna.' }
  }

  return { ok: true, address: addresses.find((a) => isIP(a) === 4) ?? addresses[0] }
}
