export interface TargetOpposition {
  id: string
  created_at: string
  name: string
  is_active: boolean
  position: number
}

export interface LeadStatus {
  id: string
  created_at: string
  name: string
  slug: string
  position: number
  color: string
}

export interface Lead {
  id: string
  created_at: string
  full_name: string
  email: string
  phone: string
  target_opposition: string
  status_id: string
  lead_statuses?: LeadStatus
}

export interface LeadHistory {
  id: string
  created_at: string
  lead_id: string
  action: string
  performed_by: string
  previous_status_id?: string | null
  new_status_id?: string | null
}