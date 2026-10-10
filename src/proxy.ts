import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Protección centralizada del área privada: toda ruta /dashboard/** exige
 * sesión válida ANTES de renderizar, y la sesión de Supabase se refresca aquí.
 * "Denegar por defecto": una página nueva bajo /dashboard queda protegida aunque olvide comprobarlo.
 *
 * Esto NO sustituye la comprobación dentro de cada Server Action: las Server Functions no son
 * rutas independientes y un cambio de matcher o de ubicación podría dejarlas sin cobertura
 * (doc de Next sobre proxy). Las actions siguen llamando a getUser().
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // getUser() valida el token contra Supabase Auth (getSession() solo lee la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
