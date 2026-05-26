import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORY_COLOR, CATEGORY_EMOJI, type Expense } from '../lib/types'
import { Settings, TrendingDown, TrendingUp, Minus, CalendarClock } from 'lucide-react'
import BudgetSheet from './BudgetSheet'

function fmt(val: number) {
  return val.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function monthRange(offset = 0) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offset
  const from = new Date(y, m, 1).toISOString().split('T')[0]
  const to = new Date(y, m + 1, 0).toISOString().split('T')[0]
  return { from, to }
}

function monthLabel(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return d.toLocaleString('pt-PT', { month: 'long', year: 'numeric' })
}

interface Budget { category: string; monthly_limit: number }

function ForecastCard({ total, prevTotal, budgets }: { total: number; prevTotal: number; budgets: Budget[] }) {
  const now = new Date()
  const daysElapsed = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - daysElapsed
  const dailyAvg = daysElapsed > 0 ? total / daysElapsed : 0
  const projected = dailyAvg * daysInMonth

  const totalBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0)
  const reference = totalBudget > 0 ? totalBudget : prevTotal > 0 ? prevTotal : projected
  const pct = reference > 0 ? Math.min((projected / reference) * 100, 100) : 0
  const over = projected > reference && reference > 0
  const referenceLabel = totalBudget > 0 ? 'orçamento' : 'mês passado'

  if (daysElapsed < 3) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} className="text-gray-400" />
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Previsão de fim de mês</h2>
      </div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-2xl font-bold text-gray-900">{fmt(projected)}</p>
          <p className="text-xs text-gray-400 mt-0.5">estimado • ritmo de {fmt(dailyAvg)}/dia</p>
        </div>
        <div className="text-right">
          {reference > 0 && (
            <>
              <p
                className="text-sm font-semibold"
                style={{ color: over ? '#ef4444' : '#10b981' }}
              >
                {over ? '+' : '-'}{fmt(Math.abs(projected - reference))}
              </p>
              <p className="text-xs text-gray-400">vs {referenceLabel}</p>
            </>
          )}
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: over ? '#ef4444' : '#10b981' }}
        />
      </div>
      <div className="flex justify-between">
        <p className="text-xs text-gray-400">Hoje — dia {daysElapsed}</p>
        <p className="text-xs text-gray-400">{daysLeft} dias restantes</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [prevTotal, setPrevTotal] = useState(0)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [showBudget, setShowBudget] = useState(false)

  const load = () => {
    const curr = monthRange(0)
    const prev = monthRange(-1)

    Promise.all([
      supabase.from('expenses').select('*').gte('date', curr.from).lte('date', curr.to).order('date', { ascending: false }),
      supabase.from('expenses').select('amount').gte('date', prev.from).lte('date', prev.to),
      supabase.from('budgets').select('*'),
    ]).then(([currRes, prevRes, budgetRes]) => {
      setExpenses(currRes.data ?? [])
      setPrevTotal((prevRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0))
      setBudgets(budgetRes.data ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const delta = total - prevTotal
  const deltaPct = prevTotal > 0 ? (delta / prevTotal) * 100 : null

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount)
    return acc
  }, {})

  const categoryList = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  const topStore = expenses.reduce<Record<string, number>>((acc, e) => {
    if (e.store) acc[e.store] = (acc[e.store] ?? 0) + Number(e.amount)
    return acc
  }, {})
  const topStoreName = Object.entries(topStore).sort((a, b) => b[1] - a[1])[0]

  const budgetMap = Object.fromEntries(budgets.map(b => [b.category, b.monthly_limit]))
  const overBudget = categoryList.filter(([cat, val]) => budgetMap[cat] && val > budgetMap[cat])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <div className="p-4 space-y-4 pb-6">
        {/* Header */}
        <div className="flex items-start justify-between pt-4">
          <div>
            <p className="text-sm text-gray-500 capitalize">{monthLabel(0)}</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-0.5">{fmt(total)}</h1>
            {deltaPct !== null && (
              <div className="flex items-center gap-1 mt-1">
                {delta > 0
                  ? <TrendingUp size={14} className="text-red-500" />
                  : delta < 0
                  ? <TrendingDown size={14} className="text-emerald-500" />
                  : <Minus size={14} className="text-gray-400" />}
                <span className="text-sm font-medium" style={{ color: delta > 0 ? '#ef4444' : delta < 0 ? '#10b981' : '#9ca3af' }}>
                  {delta > 0 ? '+' : ''}{fmt(delta)} vs mês anterior ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(0)}%)
                </span>
              </div>
            )}
          </div>
          <button onClick={() => setShowBudget(true)} className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors">
            <Settings size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Forecast */}
        <ForecastCard total={total} prevTotal={prevTotal} budgets={budgets} />

        {/* Alerts */}
        {overBudget.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1">
            <p className="text-sm font-semibold text-red-700">Orçamento ultrapassado</p>
            {overBudget.map(([cat, val]) => (
              <p key={cat} className="text-xs text-red-600">
                {CATEGORY_EMOJI[cat]} {cat}: {fmt(val)} (limite {fmt(budgetMap[cat])})
              </p>
            ))}
          </div>
        )}

        {/* Insights */}
        {(topStoreName || prevTotal > 0) && (
          <div className="flex gap-3">
            {topStoreName && (
              <div className="flex-1 bg-white rounded-2xl p-3.5 shadow-sm">
                <p className="text-xs text-gray-400 font-medium">Loja favorita</p>
                <p className="text-sm font-bold text-gray-800 mt-1 truncate">{topStoreName[0]}</p>
                <p className="text-xs text-gray-500">{fmt(topStoreName[1])}</p>
              </div>
            )}
            {prevTotal > 0 && (
              <div className="flex-1 bg-white rounded-2xl p-3.5 shadow-sm">
                <p className="text-xs text-gray-400 font-medium capitalize">{monthLabel(-1)}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{fmt(prevTotal)}</p>
                <p className="text-xs" style={{ color: delta > 0 ? '#ef4444' : '#10b981' }}>
                  {delta > 0 ? '↑ mais caro' : '↓ poupaste'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Categories */}
        {categoryList.length > 0 ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Por categoria</h2>
            {categoryList.map(([cat, val]) => {
              const color = CATEGORY_COLOR[cat] ?? '#94a3b8'
              const limit = budgetMap[cat]
              const pct = limit ? Math.min((val / limit) * 100, 100) : total > 0 ? (val / total) * 100 : 0
              const over = limit && val > limit
              return (
                <div key={cat}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-gray-700">{CATEGORY_EMOJI[cat] ?? '📦'} {cat}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(val)}</span>
                      {limit && <span className="text-xs text-gray-400 ml-1">/ {fmt(limit)}</span>}
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? '#ef4444' : color }} />
                  </div>
                  {limit && (
                    <p className="text-xs mt-0.5" style={{ color: over ? '#ef4444' : '#9ca3af' }}>
                      {over ? `${fmt(val - limit)} acima do limite` : `${fmt(limit - val)} restantes`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm flex flex-col items-center gap-3 text-center">
            <TrendingDown size={40} className="text-gray-300" />
            <p className="text-gray-400 text-sm">Sem despesas este mês.<br />Usa o Scan para adicionar a primeira!</p>
          </div>
        )}

        {/* Recent */}
        {expenses.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Recentes</h2>
            <div className="space-y-3">
              {expenses.slice(0, 5).map(e => (
                <div key={e.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{CATEGORY_EMOJI[e.category] ?? '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{e.store || e.category}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(e.date + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">-{fmt(Number(e.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showBudget && <BudgetSheet onClose={() => { setShowBudget(false); load() }} />}
    </>
  )
}
