'use client'

import { useState } from 'react'
import { LeadStatus } from '@/types'
import { updateLeadStatus } from '@/app/actions/admin-leads'

interface StatusSelectProps {
  leadId: string
  currentStatusId: string
  statuses: LeadStatus[]
}

export default function StatusSelect({ leadId, currentStatusId, statuses }: StatusSelectProps) {
  const [loading, setLoading] = useState(false)
  const [statusId, setStatusId] = useState(currentStatusId)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatusId = e.target.value
    setLoading(true)
    const result = await updateLeadStatus(leadId, statusId, newStatusId)
    setLoading(false)

    if (result.success) {
      setStatusId(newStatusId)
    } else {
      alert('Error al actualizar el estado: ' + result.error)
    }
  }

  const currentStatus = statuses.find((s) => s.id === statusId)

  return (
    <select
      value={statusId}
      onChange={handleChange}
      disabled={loading}
      className="px-2.5 py-1 text-xs rounded-full font-semibold border cursor-pointer focus:outline-none disabled:opacity-50"
      style={{
        backgroundColor: `${currentStatus?.color || '#cbd5e1'}15`,
        borderColor: currentStatus?.color || '#cbd5e1',
        color: currentStatus?.color || '#475569',
      }}
    >
      {statuses.map((status) => (
        <option key={status.id} value={status.id} className="text-slate-800 bg-white font-normal">
          {status.name}
        </option>
      ))}
    </select>
  )
}