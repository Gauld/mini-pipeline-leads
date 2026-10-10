import type { Lead } from '@/types'

export interface LeadFilters {
  statusId?: string
  name?: string
  email?: string
  phone?: string
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const digits = (value: string) => value.replace(/\D/g, '')

export function filterLeads(leads: Lead[], filters: LeadFilters): Lead[] {
  const name = normalize(filters.name ?? '')
  const email = normalize(filters.email ?? '')
  const phone = digits(filters.phone ?? '')
  const statusId = filters.statusId?.trim() ?? ''

  return leads.filter(
    (lead) =>
      (!statusId || lead.status_id === statusId) &&
      (!name || normalize(lead.full_name).includes(name)) &&
      (!email || normalize(lead.email).includes(email)) &&
      (!phone || digits(lead.phone).includes(phone))
  )
}
