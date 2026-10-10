'use client'

import { useState, useTransition } from 'react'
import { sendFollowUpEmail } from '@/app/actions/admin-leads'
import { renderTemplate } from '@/lib/leads/render-template'
import { EmailTemplate, Lead, LeadStatus } from '@/types'

interface FollowUpButtonProps {
  lead: Pick<Lead, 'id' | 'full_name' | 'email' | 'target_opposition' | 'status_id'>
  templates: EmailTemplate[]
  statuses: LeadStatus[]
}

export default function FollowUpButton({ lead, templates, statuses }: FollowUpButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const vars = { nombre: lead.full_name, oposicion: lead.target_opposition }
  const statusName = (statusId: string) => statuses.find((s) => s.id === statusId)?.name ?? ''

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id)
    setTemplateId(id)
    if (template) {
      setSubject(renderTemplate(template.subject, vars))
      setBody(renderTemplate(template.body, vars))
    }
  }

  function handleOpen() {
    setFeedback(null)
    setIsOpen(true)
    // Preselecciona la plantilla del estado actual del lead.
    const current = templates.find((t) => t.status_id === lead.status_id) ?? templates[0]
    if (current) applyTemplate(current.id)
    else {
      setTemplateId('')
      setSubject('')
      setBody('')
    }
  }

  function handleSend() {
    setFeedback(null)
    startTransition(async () => {
      const result = await sendFollowUpEmail(lead.id, subject, body)
      if (result.success) {
        setIsOpen(false)
      } else {
        setFeedback({ type: 'error', text: result.error ?? 'Error al registrar el email.' })
      }
    })
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
      >
        Enviar email de seguimiento
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden border border-slate-200 text-left">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Email de seguimiento</h3>
                <p className="text-xs text-slate-500">
                  Para {lead.full_name} &lt;{lead.email}&gt;
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No hay plantillas. Ejecuta supabase/schema.sql para crearlas.
                </p>
              ) : (
                <>
                  <label className="block text-xs font-medium text-slate-600">
                    Plantilla
                    <select
                      value={templateId}
                      onChange={(e) => applyTemplate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {statusName(t.status_id)}
                          {t.status_id === lead.status_id ? ' (estado actual)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    Asunto
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={200}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    />
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    Mensaje
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={10}
                      maxLength={5000}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    />
                  </label>

                  <p className="text-[11px] text-slate-400">
                    Puedes editar el texto antes de enviar; la plantilla guardada no se modifica.
                  </p>
                </>
              )}

              {feedback && (
                <p className="text-xs text-rose-600" role="alert">
                  {feedback.text}
                </p>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={isPending || !subject.trim() || !body.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
