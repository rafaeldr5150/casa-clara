import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, CATEGORY_EMOJI, type ExpenseInsert } from '../lib/types'
import { Check, Loader2, Zap } from 'lucide-react'

interface Props {
  initial?: { amount?: number | null; store?: string }
  onSaved: () => void
  onCancel: () => void
  fromShare?: boolean
}

export default function QuickPay({ initial, onSaved, onCancel, fromShare }: Props) {
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [store, setStore] = useState(initial?.store ?? '')
  const [category, setCategory] = useState('Outros')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.focus()
    amountRef.current?.select()
  }, [])

  // Auto-guess category from store name
  useEffect(() => {
    if (!store) return
    const s = store.toLowerCase()
    if (/mercadona|lidl|carrefour|aldi|dia|hipercor|eroski|consum|alcampo/.test(s)) setCategory('Supermercado')
    else if (/mcdonald|burger|kfc|subway|domino|telepizza|bk |restauran|cafe|bar |cafeteria|cerveceria/.test(s)) setCategory('Restaurante')
    else if (/repsol|bp |cepsa|galp|shell|gasolinera/.test(s)) setCategory('Gasolina')
    else if (/farmacia|pharmacy/.test(s)) setCategory('Farmácia')
    else if (/zara|h&m|mango|primark|pull|massimo|bershka|stradivarius|lefties/.test(s)) setCategory('Vestuário')
    else if (/renfe|metro|bus|taxi|uber|cabify|blablacar/.test(s)) setCategory('Transporte')
    else if (/netflix|spotify|hbo|disney|amazon prime|youtube/.test(s)) setCategory('Lazer')
    else if (/ikea|leroy|brico|aki |ferreteria/.test(s)) setCategory('Casa')
    else if (/clinica|medico|hospital|dentista|fisio/.test(s)) setCategory('Saúde')
  }, [store])

  const handleSave = async () => {
    const val = parseFloat(amount.replace(',', '.'))
    if (!val || val <= 0) { setError('Introduz um valor válido.'); return }
    setSaving(true)
    setError('')
    const expense: ExpenseInsert = {
      date: new Date().toISOString().split('T')[0],
      store: store.trim(),
      category,
      amount: val,
      description: fromShare ? 'Capturado da notificação' : '',
      currency: 'EUR',
      items: null,
    }
    const { error: err } = await supabase.from('expenses').insert(expense)
    setSaving(false)
    if (err) setError('Erro ao guardar.')
    else onSaved()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#d1fae5' }}>
          <Zap size={16} style={{ color: '#10b981' }} />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">
            {fromShare ? 'Pagamento capturado' : 'Pagamento rápido'}
          </p>
          <p className="text-xs text-gray-400">
            {fromShare ? 'Confirma os dados da notificação' : 'Acabei de pagar'}
          </p>
        </div>
      </div>

      {/* Amount — big and centered */}
      <div className="text-center">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Valor</label>
        <div className="flex items-center justify-center gap-1 mt-2">
          <span className="text-3xl font-light text-gray-400">€</span>
          <input
            ref={amountRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0,00"
            className="text-4xl font-bold text-gray-900 w-40 text-center bg-transparent border-0 focus:outline-none focus:ring-0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <div className="h-px bg-gray-200 mx-8 mt-1" />
      </div>

      {/* Category — horizontal scroll chips */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Categoria</label>
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
              style={{
                background: category === cat ? '#10b981' : '#f3f4f6',
                color: category === cat ? 'white' : '#374151',
              }}
            >
              <span>{CATEGORY_EMOJI[cat]}</span>
              <span>{cat}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Store */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Estabelecimento</label>
        <input
          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="ex: McDonald's (opcional)"
          value={store}
          onChange={e => setStore(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: '#10b981' }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {saving ? 'A guardar...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
