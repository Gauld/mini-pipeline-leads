import type { Metadata } from 'next'
import LegalShell from '../LegalShell'
import { LEGAL } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: 'Aviso legal',
  robots: { index: true, follow: true },
}

export default function LegalNoticePage() {
  return (
    <LegalShell title="Aviso legal">
      <h2>1. Titular del sitio web</h2>
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002 (LSSI-CE), se informa de que este sitio
        web es titularidad de:
      </p>
      <ul>
        <li>Denominación: {LEGAL.name}</li>
        <li>NIF/CIF: {LEGAL.taxId}</li>
        <li>Domicilio: {LEGAL.address}</li>
        <li>Correo electrónico: {LEGAL.email}</li>
        <li>Datos registrales: {LEGAL.registry}</li>
      </ul>

      <h2>2. Objeto</h2>
      <p>
        Este sitio permite solicitar información sobre la preparación de oposiciones. El acceso es
        gratuito; el uso implica la aceptación de este aviso.
      </p>

      <h2>3. Propiedad intelectual</h2>
      <p>
        Los contenidos y el diseño del sitio pertenecen a su titular o cuentan con licencia. No se
        permite su reproducción sin autorización.
      </p>

      <h2>4. Responsabilidad</h2>
      <p>
        El titular no garantiza la disponibilidad continua del sitio ni se responsabiliza de los
        daños derivados de interrupciones ajenas a su control.
      </p>

      <h2>5. Protección de datos y legislación aplicable</h2>
      <p>
        El tratamiento de datos personales se describe en la política de privacidad. Este aviso se
        rige por la legislación española.
      </p>
    </LegalShell>
  )
}
