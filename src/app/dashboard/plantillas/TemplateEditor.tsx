'use client'

import { useRef, useState, useTransition } from 'react'
import { saveEmailTemplate } from '@/app/actions/admin-leads'
import { TEMPLATE_VARIABLES } from '@/lib/leads/render-template'
import { EmailTemplate, LeadStatus } from '@/types'

type Field = 'subject' | 'body'

export default function TemplateEditor({
  statuses,
  templates,
}: {
  statuses: LeadStatus[]
  templates: EmailTemplate[]
}) {
  const [statusId, setStatusId] = useState(statuses[0]?.id ?? '')
  const [drafts, setDrafts] = useState(
    () => new Map(templates.map((t) => [t.status_id, { subject: t.subject, body: t.body }]))
  )
  const [lastField, setLastField] = useState<Field>('body')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Un estado sin plantilla se edita en blanco; al guardar se crea (upsert).
  const draft = drafts.get(statusId) ?? { subject: '', body: '' }

  function update(field: Field, value: string) {
    setFeedback(null)
    setDrafts((prev) => new Map(prev).set(statusId, { ...draft, [field]: value }))
  }

  function insertVariable(key: string) {
    const token = `{{${key}}}`
    const el = lastField === 'subject' ? subjectRef.current : bodyRef.current
    if (!el) return
    const start = el.selectionStart ?? draft[lastField].length
    const end = el.selectionEnd ?? start
    const value = draft[lastField]
    update(lastField, value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function handleSave() {
    setFeedback(null)
    startTransition(async () => {
      const result = await saveEmailTemplate(statusId, draft.subject, draft.body)
      setFeedback(
        result.success
          ? { type: 'success', text: 'Plantilla guardada' }
          : { type: 'error', text: result.error ?? 'Error al guardar.' }
      )
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setStatusId(s.id)
              setFeedback(null)
            }}
            className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              borderColor: s.color,
              color: s.id === statusId ? '#fff' : s.color,
              backgroundColor: s.id === statusId ? s.color : `${s.color}15`,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Insertar variable:</span>
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVariable(v.key)}
              className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              {v.label} <code className="text-[11px] text-slate-500">{`{{${v.key}}}`}</code>
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-slate-600">
          Asunto
          <input
            ref={subjectRef}
            type="text"
            value={draft.subject}
            onChange={(e) => update('subject', e.target.value)}
            onFocus={() => setLastField('subject')}
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Mensaje
          <textarea
            ref={bodyRef}
            value={draft.body}
            onChange={(e) => update('body', e.target.value)}
            onFocus={() => setLastField('body')}
            rows={12}
            maxLength={5000}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !draft.subject.trim() || !draft.body.trim()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar plantilla'}
          </button>
          {feedback && (
            <p
              role="status"
              className={`text-xs ${feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {feedback.text}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
