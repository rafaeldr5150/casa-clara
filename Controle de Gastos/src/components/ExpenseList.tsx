import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORY_EMOJI, type Expense } from '../lib/types'
import { Trash2, Search, ChevronDown, ChevronUp } from 'lucide-react'

function fmt(val: number) {
  return val.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function fmtN(val: number) {
  return val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function groupByDate(expenses: Expense[]): Record<string, Expense[]> {
  return expenses.reduce<Record<string, Expense[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = []
    acc[e.date].push(e)
    return acc
  }, {})
}

function dateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })
}

function ExpenseRow({ expense, onDelete }: { expense: Expense; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const hasItems = expense.items && expense.items.length > 0

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl shrink-0">{CATEGORY_EMOJI[expense.category] ?? '📦'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{expense.store || expense.category}</p>
          {expense.description && (
            <p className="text-xs text-gray-400 truncate">{expense.description}</p>
          )}
          {hasItems && (
            <p className="text-xs text-gray-400">{expense.items!.length} produtos</p>
          )}
        </div>
        <span className="text-sm font-semibold text-gray-800 shrink-0">-{fmt(Number(expense.amount))}</span>
        {hasItems && (
          <button
            onClick={() => setOpen(o => !o)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"
          >
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
        <button
          onClick={() => onDelete(expense.id)}
          className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {open && hasItems && (
        <div className="mx-4 mb-3 border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span className="col-span-6">Produto</span>
            <span className="col-span-2 text-center">Qtd</span>
            <span className="col-span-2 text-right">Preço</span>
            <span className="col-span-2 text-right">Total</span>
          </div>
          {expense.items!.map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-12 px-3 py-2 text-xs text-gray-700"
              style={{ borderTop: '1px solid #f3f4f6' }}
            >
              <span className="col-span-6 truncate pr-1">{item.name}</span>
              <span className="col-span-2 text-center text-gray-500">{item.quantity}</span>
              <span className="col-span-2 text-right text-gray-500">€{fmtN(item.unit_price)}</span>
              <span className="col-span-2 text-right font-medium">€{fmtN(item.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExpenseList() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setExpenses(data ?? [])
        setLoading(false)
      })
  }, [])

  const handleDelete = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const filtered = search
    ? expenses.filter(e =>
        e.store.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase()) ||
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        e.items?.some(it => it.name.toLowerCase().includes(search.toLowerCase()))
      )
    : expenses

  const grouped = groupByDate(filtered)
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 pb-6">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-gray-900">Despesas</h1>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="Pesquisar produto, loja..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {dates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Sem despesas ainda</p>
          <p className="text-sm mt-1">Usa o Scan para adicionar a primeira!</p>
        </div>
      ) : (
        dates.map(date => (
          <div key={date}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 capitalize">
              {dateLabel(date)}
            </p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-50">
              {grouped[date].map(e => (
                <ExpenseRow key={e.id} expense={e} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
