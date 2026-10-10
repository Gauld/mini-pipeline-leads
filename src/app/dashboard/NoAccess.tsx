import { logout } from '@/app/actions/auth'

/** Usuario autenticado pero sin fila en user_roles: no tiene ningún permiso. */
export default function NoAccess({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-8">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-slate-800">Tu cuenta no tiene permisos</h1>
        <p className="mt-2 text-sm text-slate-500">
          {email ? (
            <>
              La cuenta <span className="font-medium text-slate-700">{email}</span> no tiene ningún rol
              asignado.
            </>
          ) : (
            'Esta cuenta no tiene ningún rol asignado.'
          )}{' '}
          Pide a un administrador que te asigne uno.
        </p>
        <form action={logout} className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cerrar Sesión
          </button>
        </form>
      </div>
    </div>
  )
}
