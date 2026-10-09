'use client'

import { useState } from 'react'
import { login } from '@/app/actions/auth'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await login(formData)

    // Si la función hace redirect(), no llegará aquí; si devuelve un objeto con error:
    if (result && !result.success) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Acceso Administrativo</h1>
        <p className="text-slate-500 text-sm mb-6">
          Inicia sesión para gestionar los leads y solicitudes.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              name="email"
              required
              placeholder="admin@ejemplo.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              name="password"
              required
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </main>
  )
}