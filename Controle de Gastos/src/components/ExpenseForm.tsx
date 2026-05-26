import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, CATEGORY_EMOJI, type ExpenseInsert, type ExpenseItem } from '../lib/types'
import { Check, Loader2, Trash2, Plus } from 'lucide-react'

interface Props {
  initial: Partial<ExpenseInsert>
  onSaved: () => void
  onCancel?: () => void
}

function fmt(val: number) {
  return val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ExpenseForm({ initial, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<ExpenseInsert>({
    date: initial.date ?? new Date().toISOString().split('T')[0],
    store: initial.store ?? '',
    category: initial.category ?? 'Outros',
    amount: initial.amount ?? 0,
    description: initial.description ?? '',
    currency: 'EUR',
    items: initial.items ?? [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: keyof ExpenseInsert, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }))

  const updateItem = (i: number, field: keyof ExpenseItem, value: string) => {
    const items = [...(form.items ?? [])]
    const item = { ...items[i], [field]: field === 'name' ? value : parseFloat(value) || 0 }
    if (field === 'quantity' || field === 'unit_price') {
      item.total = parseFloat((item.quantity * item.unit_price).toFixed(2))
    }
    items[i] = item
    const total = parseFloat(items.reduce((s, it) => s + it.total, 0).toFixed(2))
    setForm(f => ({ ...f, items, amount: total > 0 ? total : f.amount }))
  }

  const removeItem = (i: number) => {
    const items = (form.items ?? []).filter((_, idx) => idx !== i)
    const total = parseFloat(items.reduce((s, it) => s + it.total, 0).toFixed(2))
    setForm(f => ({ ...f, items, amount: total > 0 ? total : f.amount }))
  }

  const addItem = () => {
    setForm(f => ({
      ...f,
      items: [...(f.items ?? []), { name: '', quantity: 1, unit_price: 0, total: 0 }],
    }))
  }

  const handleSave = async () => {
    if (!form.amount || form.amount <= 0) {
      setError('Introduz um valor válido.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('expenses').insert(form)
    setSaving(false)
    if (err) setError('Erro ao guardar. Tenta novamente.')
    else onSaved()
  }

  const items = form.items ?? []

  return (
    <div className="bg-white rounded-2xl p-5 space-y-4 shadow-sm">
      {/* Store */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estabelecimento</label>
        <input
          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          value={form.store}
          onChange={e => set('store', e.target.value)}
          placeholder="ex: Mercadona"
        />
      </div>

      {/* Amount + Date */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total (€)</label>
          <input
            type="number" step="0.01" min="0"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={form.amount || ''}
            onChange={e => set('amount', parseFloat(e.target.value) || 0)}
            placeholder="0,00"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</label>
          <input
            type="date"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={form.date}
            onChange={e => set('date', e.target.value)}
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => set('category', cat)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
              style={{
                background: form.category === cat ? '#10b981' : '#f3f4f6',
                color: form.category === cat ? 'white' : '#374151',
              }}
            >
              {CATEGORY_EMOJI[cat]} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Produtos {items.length > 0 && `(${items.length})`}
          </label>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-xs text-emerald-600 font-semibold"
          >
            <Plus size={13} /> Adicionar
          </button>
        </div>

        {items.length > 0 ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <span className="col-span-5">Produto</span>
              <span className="col-span-2 text-center">Qtd</span>
              <span className="col-span-2 text-right">Preço</span>
              <span className="col-span-2 text-right">Total</span>
              <span className="col-span-1" />
            </div>

            {items.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-1 px-3 py-2 items-center"
                style={{ borderTop: '1px solid #f3f4f6' }}
              >
                <input
                  className="col-span-5 text-xs border-0 bg-transparent text-gray-800 focus:outline-none focus:bg-gray-50 rounded px-1 py-0.5"
                  value={item.name}
                  onChange={e => updateItem(i, 'name', e.target.value)}
                  placeholder="Nome"
                />
                <input
                  type="number" min="0" step="0.001"
                  className="col-span-2 text-xs border-0 bg-transparent text-center text-gray-800 focus:outline-none focus:bg-gray-50 rounded px-1 py-0.5"
                  value={item.quantity || ''}
                  onChange={e => updateItem(i, 'quantity', e.target.value)}
                />
                <input
                  type="number" min="0" step="0.01"
                  className="col-span-2 text-xs border-0 bg-transparent text-right text-gray-800 focus:outline-none focus:bg-gray-50 rounded px-1 py-0.5"
                  value={item.unit_price || ''}
                  onChange={e => updateItem(i, 'unit_price', e.target.value)}
                />
                <span className="col-span-2 text-xs text-right text-gray-600 font-medium">
                  {fmt(item.total)}
                </span>
                <button
                  onClick={() => removeItem(i)}
                  className="col-span-1 flex justify-end text-gray-300 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {/* Subtotal row */}
            <div className="flex justify-between px-3 py-2 bg-gray-50" style={{ borderTop: '1px solid #e5e7eb' }}>
              <span className="text-xs font-semibold text-gray-500">Total calculado</span>
              <span className="text-xs font-bold text-gray-800">
                €{fmt(items.reduce((s, it) => s + it.total, 0))}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-2">Sem produtos extraídos — podes adicionar manualmente.</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nota (opcional)</label>
        <input
          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="ex: compras da semana"
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold"
          >
            Cancelar
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
          style={{ background: '#10b981' }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {saving ? 'A guardar...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
