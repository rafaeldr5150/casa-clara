import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, CATEGORY_EMOJI } from '../lib/types'
import { X, Loader2 } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function BudgetSheet({ onClose }: Props) {
  const [limits, setLimits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('budgets').select('*').then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {}
        data.forEach(b => { map[b.category] = String(b.monthly_limit) })
        setLimits(map)
      }
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const upserts = Object.entries(limits)
      .filter(([, v]) => v !== '' && parseFloat(v) > 0)
      .map(([category, monthly_limit]) => ({ category, monthly_limit: parseFloat(monthly_limit) }))

    const deletes = Object.entries(limits)
      .filter(([, v]) => v === '' || parseFloat(v) <= 0)
      .map(([category]) => category)

    if (upserts.length > 0) {
      const { error } = await supabase.from('budgets').upsert(upserts, { onConflict: 'category' })
      if (error) {
        setError(`Erro ao guardar: ${error.message}`)
        setSaving(false)
        return
      }
    }

    if (deletes.length > 0) {
      const { error } = await supabase.from('budgets').delete().in('category', deletes)
      if (error) {
        setError(`Erro ao apagar: ${error.message}`)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ maxWidth: 480, left: '50%', transform: 'translateX(-50%)' }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Orçamentos Mensais</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-5">Define um limite por categoria. Deixa em branco para sem limite.</p>

        <div className="space-y-3">
          {CATEGORIES.map(cat => (
            <div key={cat} className="flex items-center gap-3">
              <span className="text-xl w-8 text-center">{CATEGORY_EMOJI[cat]}</span>
              <span className="flex-1 text-sm font-medium text-gray-700">{cat}</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  placeholder="—"
                  className="w-28 pl-7 pr-3 py-2 border border-gray-200 rounded-xl text-sm text-right text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={limits[cat] ?? ''}
                  onChange={e => setLimits(l => ({ ...l, [cat]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full py-3.5 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: '#10b981' }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          {saving ? 'A guardar...' : 'Guardar orçamentos'}
        </button>
      </div>
    </div>
  )
}
