'use client'

import { useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { LEGAL } from '@/lib/legal/company'
import { TargetOpposition } from '@/types'

declare global {
  interface Window {
    turnstile?: { reset: () => void }
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

function RequiredMark() {
  return (
    <span className="required-mark" aria-hidden="true">
      *
    </span>
  )
}

interface FormClientProps {
  oppositions: TargetOpposition[]
  createLead: (formData: FormData) => Promise<{ success: boolean; error?: string; alreadyRegistered?: boolean }>
}

export default function FormClient({ oppositions, createLead }: FormClientProps) {
  const [loading, setLoading] = useState(false)
  const [selectedOpposition, setSelectedOpposition] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    const formData = new FormData(event.currentTarget)
    const result = await createLead(formData)

    setLoading(false)
    // El token de Turnstile es de un solo uso: hay que pedir otro tras cada intento.
    window.turnstile?.reset()

    if (result.success && result.alreadyRegistered) {
      setMessage({ type: 'success', text: 'Esta solicitud ya está en revisión. Nos pondremos en contacto contigo pronto.' })
      setSelectedOpposition('')
      ;(event.target as HTMLFormElement).reset()
    } else if (result.success) {
      setMessage({ type: 'success', text: '¡Solicitud enviada con éxito! Nos pondremos en contacto contigo pronto.' })
      setSelectedOpposition('')
      ;(event.target as HTMLFormElement).reset()
    } else {
      setMessage({ type: 'error', text: result.error || 'Ocurrió un error al enviar tus datos.' })
    }
  }

  return (
    <>
      {message && (
        <div
          className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-stack">
        <p className="form-hint">
          Los campos marcados con <span className="required-mark">*</span> son obligatorios.
        </p>

        <div>
          <label htmlFor="full_name" className="form-label">
            Nombre completo <RequiredMark />
          </label>
          <input
            id="full_name"
            type="text"
            name="full_name"
            required
            placeholder="Ej. Juan Pérez"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="email" className="form-label">
            Correo electrónico <RequiredMark />
          </label>
          <input
            id="email"
            type="email"
            name="email"
            required
            placeholder="juan@ejemplo.com"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="phone" className="form-label">
            Teléfono <RequiredMark />
          </label>
          <input
            id="phone"
            type="tel"
            name="phone"
            required
            placeholder="+34 600 000 000"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="target_opposition" className="form-label">
            Oposición de interés <RequiredMark />
          </label>
          <select
            id="target_opposition"
            name="target_opposition"
            required
            value={selectedOpposition}
            onChange={(e) => setSelectedOpposition(e.target.value)}
            className="field"
          >
            <option value="" disabled>Selecciona una oposición...</option>
            {oppositions.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value="Otros">Otros</option>
          </select>
        </div>

        {selectedOpposition === 'Otros' && (
          <div>
            <label htmlFor="other_target_opposition" className="form-label">
              Especifica tu oposición <RequiredMark />
            </label>
            <input
              id="other_target_opposition"
              type="text"
              name="other_target_opposition"
              required
              placeholder="Escribe el nombre de la oposición..."
              className="field"
            />
          </div>
        )}

        {/* Información básica por capas (RGPD art. 13) + consentimientos SEPARADOS. */}
        <div className="legal-box">
          <p>
            <strong>Información básica sobre protección de datos.</strong> Responsable: {LEGAL.name}.
            Finalidad: atender tu solicitud de información y hacerle seguimiento. Legitimación: tu
            petición y, para comunicaciones comerciales que no hayas solicitado (promociones,
            novedades), tu consentimiento. Destinatarios: proveedores de alojamiento y
            correo (encargados del tratamiento). Derechos: acceso, rectificación, supresión, oposición,
            limitación y portabilidad, escribiendo a {LEGAL.email}. Más información en la{' '}
            <Link href="/privacidad" target="_blank" className="text-link">
              política de privacidad
            </Link>
            .
          </p>

          <label className="flex items-start gap-2">
            <input type="checkbox" name="accept_privacy" required className="mt-0.5" />
            <span>
              He leído y acepto la política de privacidad. <RequiredMark />
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input type="checkbox" name="consent_marketing" className="mt-0.5" />
            <span>
              Quiero recibir comunicaciones comerciales por correo electrónico (opcional). Puedo
              retirar este consentimiento en cualquier momento.
            </span>
          </label>
        </div>

        {/* Honeypot: invisible para personas; los bots suelen rellenarlo. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            No rellenar
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        {TURNSTILE_SITE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-accent btn-block"
        >
          {loading ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </form>
    </>
  )
}