import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'

export const instant = false

export const metadata: Metadata = {
  title: 'Estado de tu solicitud',
  robots: { index: false, follow: false },
}

const MESSAGES = {
  enviada: {
    title: '¡Solicitud enviada con éxito!',
    text: 'Nos pondremos en contacto contigo pronto.',
  },
  revision: {
    title: 'Tu solicitud ya está en revisión',
    text: 'Esta solicitud ya está en revisión. Nos pondremos en contacto contigo pronto.',
  },
} as const

export default async function RequestStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  // Opt-in explícito a renderizado dinámico compatible con cacheComponents
  await connection()

  const { estado } = await searchParams
  if (estado !== 'enviada' && estado !== 'revision') redirect('/')
  const { title, text } = MESSAGES[estado]

  return (
    <main className="public-theme page page-center">
      <div className="card text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600"
        >
          ✓
        </div>
        <h1 className="page-title">{title}</h1>
        <p className="mb-6 text-sm text-slate-500">{text}</p>
        <Link href="/" className="btn btn-primary">
          Volver al inicio
        </Link>
      </div>
    </main>
  )
}
