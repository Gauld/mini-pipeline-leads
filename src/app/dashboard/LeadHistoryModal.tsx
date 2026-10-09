'use client'

import { useState } from 'react'
import { getLeadHistory } from '@/app/actions/admin-leads'
import { LeadStatus } from '@/types'

interface HistoryRecord {
  id: string
  created_at: string
  action: string
  performed_by: string
  old_status_id?: string | null
  new_status_id?: string | null
}

interface LeadHistoryModalProps {
  leadId: string
  leadName: string
  statuses: LeadStatus[]
}

export default function LeadHistoryModal({ leadId, leadName, statuses }: LeadHistoryModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const statusMap = new Map(statuses.map((s) => [s.id, s]))

  async function handleOpen() {
    setIsOpen(true)
    setLoading(true)
    setError(null)

    const result = await getLeadHistory(leadId)

    setLoading(false)

    if (result.success && result.data) {
      setHistory(result.data)
    } else {
      setError(result.error || 'Error al cargar el historial.')
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-md transition-colors border border-slate-200"
      >
        Historial
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 text-left">
            {/* Cabecera */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Historial de Auditoría</h3>
                <p className="text-xs text-slate-500">{leadName}</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Contenido */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {loading && (
                <div className="text-center py-8 text-slate-400 text-sm">Cargando historial...</div>
              )}

              {error && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
                  {error}
                </div>
              )}

              {!loading && !error && history.length === 0 && (
                <p className="text-center py-6 text-slate-500 text-sm">
                  No hay registros de cambios para este lead.
                </p>
              )}

              {!loading && !error && history.length > 0 && (
                <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
                  {history.map((item) => {
                    const oldStatus = item.old_status_id ? statusMap.get(item.old_status_id) : null
                    const newStatus = item.new_status_id ? statusMap.get(item.new_status_id) : null

                    return (
                      <div key={item.id} className="ml-6 relative">
                        {/* Indicador en la línea de tiempo */}
                        <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white" />

                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-semibold text-slate-800">{item.action}</span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(item.created_at).toLocaleString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 mb-2">
                          Realizado por: <span className="font-medium text-slate-700">{item.performed_by}</span>
                        </p>

                        {(oldStatus || newStatus) && (
                          <div className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded-md border border-slate-100">
                            {oldStatus && (
                              <span
                                className="px-2 py-0.5 rounded text-[11px] font-medium"
                                style={{
                                  backgroundColor: `${oldStatus.color}15`,
                                  color: oldStatus.color,
                                }}
                              >
                                {oldStatus.name}
                              </span>
                            )}
                            {oldStatus && newStatus && <span className="text-slate-400">→</span>}
                            {newStatus && (
                              <span
                                className="px-2 py-0.5 rounded text-[11px] font-medium"
                                style={{
                                  backgroundColor: `${newStatus.color}15`,
                                  color: newStatus.color,
                                }}
                              >
                                {newStatus.name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Pie del Modal */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}