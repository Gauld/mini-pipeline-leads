import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM: cifra y autentica. Formato: v1:<iv>:<tag>:<datos>, todo en base64.
const VERSION = 'v1'
const IV_BYTES = 12
const KEY_BYTES = 32

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(`La clave de cifrado debe tener ${KEY_BYTES} bytes en base64 (openssl rand -base64 32).`)
  }
  return key
}

export function encryptSecret(plain: string, keyBase64: string): string {
  const key = parseKey(keyBase64)
  const iv = randomBytes(IV_BYTES) // nunca reutilizar IV con la misma clave
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const key = parseKey(keyBase64)
  const [version, iv, tag, data] = payload.split(':')
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error('Formato de secreto cifrado no reconocido.')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}
