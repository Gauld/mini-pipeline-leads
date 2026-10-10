import type { Metadata } from 'next'
import LegalShell from '../LegalShell'
import { LEGAL } from '@/lib/legal/company'
import { CONSENT_TEXT_VERSION } from '@/lib/leads/consent'

export const metadata: Metadata = {
  title: 'Política de privacidad',
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Política de privacidad">
      <p className="legal-meta">Versión del texto: {CONSENT_TEXT_VERSION}</p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        {LEGAL.name} · {LEGAL.taxId} · {LEGAL.address} · Contacto de privacidad: {LEGAL.email}
      </p>

      <h2>2. Qué datos tratamos</h2>
      <p>
        Nombre completo, correo electrónico, teléfono y la oposición de tu interés, que nos facilitas
        en el formulario. También registramos la fecha de tus consentimientos, la versión del texto
        legal que se te mostró y un historial de las gestiones realizadas sobre tu solicitud
        (cambios de estado y correos enviados). No te pedimos datos de categorías especiales; te
        rogamos que no los incluyas en el campo de texto libre.
      </p>

      <h2>3. Para qué y con qué base jurídica</h2>
      <ul>
        <li>
          <strong>Atender tu solicitud de información</strong>, enviarte la respuesta inicial y
          hacerle seguimiento por correo, limitado a lo que has pedido: tu petición, medidas
          precontractuales (art. 6.1.b RGPD).
        </li>
        <li>
          <strong>Enviarte comunicaciones comerciales que no hayas solicitado</strong> (promociones,
          novedades): tu consentimiento (art. 6.1.a RGPD), que es opcional, se pide con una casilla
          separada y puedes retirar en cualquier momento sin que afecte a tu solicitud.
        </li>
        <li>
          <strong>Seguridad y prevención de abuso</strong> del formulario: interés legítimo (art.
          6.1.f RGPD). Para ello tratamos de forma seudonimizada (hash) tu dirección IP y tu correo
          con el único fin de limitar envíos repetidos.
        </li>
      </ul>

      <h2>4. Destinatarios</h2>
      <p>No cedemos tus datos a terceros salvo obligación legal. Acceden como encargados del tratamiento:</p>
      <ul>
        {LEGAL.processors.map((p) => (
          <li key={p.name}>
            {p.name}: {p.purpose}.
          </li>
        ))}
      </ul>
      <p>
        Si alguno de estos proveedores trata datos fuera del Espacio Económico Europeo, lo hace con
        las garantías del RGPD (cláusulas contractuales tipo o decisión de adecuación).
      </p>

      <h2>5. Cuánto tiempo los conservamos</h2>
      <p>{LEGAL.retention}. Pasado ese plazo se suprimen o se anonimizan.</p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del
        tratamiento y portabilidad, y retirar tu consentimiento, escribiendo a {LEGAL.email}. Si
        consideras que no hemos tratado tus datos correctamente, puedes presentar una reclamación ante
        la Agencia Española de Protección de Datos (www.aepd.es).
      </p>

      <h2>7. Cookies</h2>
      <p>
        El formulario público no instala cookies de analítica ni de terceros. Solo se usan cookies
        técnicas de sesión en el área privada de administración, exentas de consentimiento.
      </p>
    </LegalShell>
  )
}
