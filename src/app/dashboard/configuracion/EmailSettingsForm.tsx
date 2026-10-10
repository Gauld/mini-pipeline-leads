'use client'

import { useState, useTransition } from 'react'
import { saveEmailSettings, sendTestEmail } from '@/app/actions/email-settings'

interface Initial {
  host: string
  port: number
  user: string
  fromAddress: string
  fromName: string
  simulateSending: boolean
  updatedAt: string
  updatedBy: string | null
}

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800'

export default function EmailSettingsForm({ initial }: { initial: Initial | null }) {
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(String(initial?.port ?? 465))
  const [user, setUser] = useState(initial?.user ?? '')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState(initial?.fromAddress ?? '')
  const [fromName, setFromName] = useState(initial?.fromName ?? '')
  const [simulateSending, setSimulateSending] = useState(initial?.simulateSending ?? false)
  const [hasPassword, setHasPassword] = useState(Boolean(initial))
  const [testTo, setTestTo] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isTesting, startTesting] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handleTest() {
    setTestFeedback(null)
    startTesting(async () => {
      const result = await sendTestEmail(testTo)
      setTestFeedback(
        result.success
          ? { type: 'success', text: `Enviado a ${result.sentTo}. Revisa la bandeja (y spam).` }
          : { type: 'error', text: result.error ?? 'Error al enviar la prueba.' }
      )
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = await saveEmailSettings({ host, port, user, password, fromAddress, fromName, simulateSending })
      if (result.success) {
        setPassword('')
        setHasPassword(true)
        setFeedback({ type: 'success', text: 'Configuración guardada' })
      } else {
        setFeedback({ type: 'error', text: result.error ?? 'Error al guardar.' })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <input
          type="checkbox"
          checked={simulateSending}
          onChange={(e) => setSimulateSending(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span className="text-xs text-amber-900">
          <strong>Simular envíos</strong> — no se envía ningún correo, pero se registra en el historial como
          enviado. Desactívalo para enviar con la cuenta de abajo; si falla, el error queda en el historial.
          {!initial && (
            <span className="mt-1 block text-amber-700">
              Mientras no guardes una cuenta, los envíos se simulan.
            </span>
          )}
        </span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
          Servidor SMTP
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="smtp.gmail.com"
            required
            className={inputClass}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Puerto
          <input
            type="text"
            inputMode="numeric"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            required
            className={inputClass}
          />
        </label>
      </div>
      <p className="-mt-2 text-[11px] text-slate-400">
        465 = TLS directo. Otros puertos (p. ej. 587) exigen STARTTLS; nunca se envía sin cifrar.
      </p>

      <label className="block text-xs font-medium text-slate-600">
        Usuario
        <input
          type="text"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="tu@gmail.com"
          autoComplete="off"
          required
          className={inputClass}
        />
      </label>

      <label className="block text-xs font-medium text-slate-600">
        Contraseña {hasPassword && <span className="text-emerald-600">(guardada, cifrada)</span>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={hasPassword ? '••••••••  (vacío = conservar)' : 'Contraseña de aplicación'}
          autoComplete="new-password"
          required={!hasPassword}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          Nombre del remitente (opcional)
          <input
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Academia"
            maxLength={100}
            className={inputClass}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Email del remitente (opcional)
          <input
            type="email"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder="Por defecto, el usuario"
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar configuración'}
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

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <label className="block text-xs font-medium text-slate-600">
          Enviar prueba a
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (testTo.trim() && !isTesting && !isPending) handleTest()
              }
            }}
            placeholder="destinatario@ejemplo.com"
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting || isPending || !testTo.trim()}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {isTesting ? 'Enviando prueba...' : 'Enviar email de prueba'}
          </button>
          {testFeedback && (
            <p
              role="status"
              className={`text-xs ${testFeedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {testFeedback.text}
            </p>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          Usa la configuración <strong>guardada</strong>: guarda los cambios antes de probar.
        </p>
      </div>

      {initial?.updatedBy && (
        <p className="text-[11px] text-slate-400">
          Última modificación: {initial.updatedBy},{' '}
          {new Date(initial.updatedAt).toLocaleString('es-ES')}
        </p>
      )}
    </form>
  )
}
