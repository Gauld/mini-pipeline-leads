import Link from 'next/link'
import type { ReactNode } from 'react'

/** Contenedor común de las páginas legales (aviso legal, privacidad). */
export default function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="public-theme page">
      <article className="legal-doc">
        <h1>{title}</h1>
        <p className="notice-warning">
          Plantilla técnica: los datos entre corchetes deben completarse con los reales del
          responsable antes de publicar, y el texto debe ser validado por quien trate los datos.
        </p>
        {children}
        <p className="mt-8">
          <Link href="/" className="text-link">
            ← Volver al formulario
          </Link>
        </p>
      </article>
    </main>
  )
}
