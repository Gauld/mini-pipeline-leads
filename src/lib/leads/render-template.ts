export const TEMPLATE_VARIABLES = [
  { key: 'nombre', label: 'Nombre del lead' },
  { key: 'oposicion', label: 'Oposición' },
] as const

export type TemplateVariables = Record<(typeof TEMPLATE_VARIABLES)[number]['key'], string>

/** Reemplaza {{variable}} por su valor; las variables desconocidas quedan intactas. */
export function renderTemplate(text: string, vars: TemplateVariables): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? vars[key as keyof TemplateVariables] : match
  )
}
