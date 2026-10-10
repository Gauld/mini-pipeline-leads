import type { Lead, LeadStatus } from '@/types'

export interface StatusColumn {
  status: LeadStatus
  leads: Lead[]
}

export function groupLeadsByStatus(leads: Lead[], statuses: LeadStatus[]): StatusColumn[] {
  const columns = [...statuses]
    .sort((a, b) => a.position - b.position)
    .map((status) => ({ status, leads: [] as Lead[] }))

  const byStatusId = new Map(columns.map((column) => [column.status.id, column]))

  for (const lead of leads) {
    byStatusId.get(lead.status_id)?.leads.push(lead)
  }

  return columns
}
