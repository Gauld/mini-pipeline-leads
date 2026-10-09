'use client'

import { useState } from 'react'
import { TargetOpposition } from '@/types'

interface FormClientProps {
  oppositions: TargetOpposition[]
  createLead: (formData: FormData) => Promise<{ success: boolean; error?: string }>
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

    if (result.success) {
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
          className={`p-4 rounded-lg mb-6 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo</label>
          <input
            type="text"
            name="full_name"
            required
            placeholder="Ej. Juan Pérez"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
          <input
            type="email"
            name="email"
            required
            placeholder="juan@ejemplo.com"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
          <input
            type="tel"
            name="phone"
            required
            placeholder="+34 600 000 000"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Oposición de interés</label>
          <select
            name="target_opposition"
            required
            value={selectedOpposition}
            onChange={(e) => setSelectedOpposition(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white"
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Especifica tu oposición</label>
            <input
              type="text"
              name="other_target_opposition"
              required
              placeholder="Escribe el nombre de la oposición..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 mt-2"
        >
          {loading ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </form>
    </>
  )
}