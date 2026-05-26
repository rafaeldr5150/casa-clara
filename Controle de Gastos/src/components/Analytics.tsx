import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORY_COLOR, CATEGORY_EMOJI, type Expense, type ExpenseItem } from '../lib/types'
import { Download, TrendingUp, TrendingDown, ShoppingCart, Store } from 'lucide-react'
import PriceSearch from './PriceSearch'

function fmt(val: number) {
  return val.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}
function fmtN(val: number) {
  return val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface MonthData { label: string; total: number; key: string }
interface StoreData { name: string; total: number; visits: number }

interface ProductPriceByStore {
  productName: string
  stores: { name: string; avgPrice: number; count: number }[]
  savings: number
}

interface ProductInflation {
  name: string
  oldPrice: number
  newPrice: number
  changePct: number
  oldDate: string
  newDate: string
}

function getLast12Months() {
  const result = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
    const key = from.slice(0, 7)
    const label = d.toLocaleString('pt-PT', { month: 'short' })
    result.push({ from, to, label, key })
  }
  return result
}

function normalizeProduct(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

function exportCSV(expenses: Expense[]) {
  const rows = ['Data,Estabelecimento,Categoria,Total (€),Produto,Quantidade,Preço unitário (€),Total produto (€)']
  expenses.forEach(e => {
    if (e.items && e.items.length > 0) {
      e.items.forEach((it: ExpenseItem) => {
        rows.push([e.date, `"${e.store}"`, e.category, e.amount, `"${it.name}"`, it.quantity, it.unit_price, it.total].join(','))
      })
    } else {
      rows.push([e.date, `"${e.store}"`, e.category, e.amount, '', '', '', ''].join(','))
    }
  })
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `despesas_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Analytics() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [monthly, setMonthly] = useState<MonthData[]>([])
  const [stores, setStores] = useState<StoreData[]>([])
  const [priceInflation, setPriceInflation] = useState<ProductInflation[]>([])
  const [storeComparisons, setStoreComparisons] = useState<ProductPriceByStore[]>([])
  const [personalInflationRate, setPersonalInflationRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const months = getLast12Months()
    const from = months[0].from
    const to = months[months.length - 1].to

    supabase
      .from('expenses')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .then(({ data }) => {
        const all = data ?? []
        setExpenses(all)

        // Monthly totals (last 6 for chart)
        const last6 = months.slice(6)
        const monthMap: Record<string, number> = {}
        months.forEach(m => { monthMap[m.key] = 0 })
        all.forEach(e => {
          const key = e.date.slice(0, 7)
          if (monthMap[key] !== undefined) monthMap[key] += Number(e.amount)
        })
        setMonthly(last6.map(m => ({ ...m, total: monthMap[m.key] })))

        // Top stores
        const storeMap: Record<string, { total: number; visits: number }> = {}
        all.forEach(e => {
          if (!e.store) return
          if (!storeMap[e.store]) storeMap[e.store] = { total: 0, visits: 0 }
          storeMap[e.store].total += Number(e.amount)
          storeMap[e.store].visits += 1
        })
        setStores(
          Object.entries(storeMap)
            .map(([name, d]) => ({ name, ...d }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 8)
        )

        // --- Inflação pessoal ---
        // Collect all item price points with date + store
        const productPrices: Record<string, { date: string; price: number; store: string }[]> = {}
        all.forEach(e => {
          if (!e.items) return
          e.items.forEach((it: ExpenseItem) => {
            if (!it.name || !it.unit_price || it.unit_price <= 0) return
            const key = normalizeProduct(it.name)
            if (!productPrices[key]) productPrices[key] = []
            productPrices[key].push({ date: e.date, price: it.unit_price, store: e.store })
          })
        })

        // For inflation: compare first half (months 0-5) vs second half (months 6-11)
        const midDate = months[6].from
        const inflationProducts: ProductInflation[] = []
        let weightedSum = 0
        let weightedCount = 0

        Object.entries(productPrices).forEach(([key, pts]) => {
          const old = pts.filter(p => p.date < midDate)
          const recent = pts.filter(p => p.date >= midDate)
          if (old.length === 0 || recent.length === 0) return

          const oldAvg = old.reduce((s, p) => s + p.price, 0) / old.length
          const newAvg = recent.reduce((s, p) => s + p.price, 0) / recent.length
          const changePct = ((newAvg - oldAvg) / oldAvg) * 100

          const displayName = all
            .flatMap(e => e.items ?? [])
            .find((it: ExpenseItem) => normalizeProduct(it.name) === key)?.name ?? key

          inflationProducts.push({
            name: displayName,
            oldPrice: oldAvg,
            newPrice: newAvg,
            changePct,
            oldDate: old[0].date,
            newDate: recent[recent.length - 1].date,
          })

          weightedSum += changePct * (old.length + recent.length)
          weightedCount += old.length + recent.length
        })

        if (inflationProducts.length > 0) {
          inflationProducts.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
          setPriceInflation(inflationProducts.slice(0, 8))
          setPersonalInflationRate(weightedCount > 0 ? weightedSum / weightedCount : null)
        }

        // --- Comparação entre lojas ---
        // Find products bought at 2+ different stores
        const productByStore: Record<string, Record<string, number[]>> = {}
        all.forEach(e => {
          if (!e.store || !e.items) return
          e.items.forEach((it: ExpenseItem) => {
            if (!it.name || !it.unit_price || it.unit_price <= 0) return
            const key = normalizeProduct(it.name)
            if (!productByStore[key]) productByStore[key] = {}
            if (!productByStore[key][e.store]) productByStore[key][e.store] = []
            productByStore[key][e.store].push(it.unit_price)
          })
        })

        const comparisons: ProductPriceByStore[] = []
        Object.entries(productByStore).forEach(([key, storeData]) => {
          const storeNames = Object.keys(storeData)
          if (storeNames.length < 2) return

          const storeList = storeNames.map(name => ({
            name,
            avgPrice: storeData[name].reduce((s, p) => s + p, 0) / storeData[name].length,
            count: storeData[name].length,
          })).sort((a, b) => a.avgPrice - b.avgPrice)

          const cheapest = storeList[0].avgPrice
          const mostExpensive = storeList[storeList.length - 1].avgPrice
          const savings = mostExpensive - cheapest

          const displayName = all
            .flatMap(e => e.items ?? [])
            .find((it: ExpenseItem) => normalizeProduct(it.name) === key)?.name ?? key

          comparisons.push({ productName: displayName, stores: storeList, savings })
        })

        comparisons.sort((a, b) => b.savings - a.savings)
        setStoreComparisons(comparisons.slice(0, 6))

        setLoading(false)
      })
  }, [])

  const maxMonthly = Math.max(...monthly.map(m => m.total), 1)
  const catBreakdown = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount)
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])
  const grandTotal = catBreakdown.reduce((s, [, v]) => s + v, 0)

  const totalSavingsPotential = storeComparisons.reduce((s, c) => s + c.savings, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5 pb-6">
      {/* Price search */}
      <div className="pt-4">
        <PriceSearch />
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Análise</h1>
        <button
          onClick={() => exportCSV(expenses)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-600 transition-colors"
        >
          <Download size={15} />
          Exportar CSV
        </button>
      </div>

      {/* Monthly chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-4">Últimos 6 meses</h2>
        <div className="flex items-end gap-2 h-36">
          {monthly.map((m, i) => {
            const isLast = i === monthly.length - 1
            const pct = maxMonthly > 0 ? (m.total / maxMonthly) * 100 : 0
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-400 font-medium" style={{ fontSize: 10 }}>
                  {m.total > 0 ? `€${Math.round(m.total)}` : ''}
                </span>
                <div className="w-full flex items-end" style={{ height: 80 }}>
                  <div
                    className="w-full rounded-t-lg transition-all"
                    style={{ height: `${Math.max(pct, m.total > 0 ? 4 : 0)}%`, background: isLast ? '#10b981' : '#d1fae5' }}
                  />
                </div>
                <span className="text-xs text-gray-500 capitalize">{m.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Categorias (12 meses)</h2>
        <div className="space-y-3">
          {catBreakdown.map(([cat, total]) => {
            const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0
            return (
              <div key={cat}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-700">{CATEGORY_EMOJI[cat] ?? '📦'} {cat}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{pct.toFixed(0)}%</span>
                    <span className="text-sm font-semibold text-gray-800">{fmt(total)}</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CATEGORY_COLOR[cat] ?? '#94a3b8' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top stores */}
      {stores.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Top lojas</h2>
          <div className="space-y-2.5">
            {stores.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.visits} {s.visits === 1 ? 'visita' : 'visitas'}</p>
                </div>
                <span className="text-sm font-semibold text-gray-800 shrink-0">{fmt(s.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inflação pessoal */}
      {priceInflation.length > 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between mb-1">
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Inflação pessoal</h2>
            {personalInflationRate !== null && (
              <span
                className="text-sm font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: personalInflationRate > 0 ? '#fee2e2' : '#d1fae5',
                  color: personalInflationRate > 0 ? '#dc2626' : '#059669',
                }}
              >
                {personalInflationRate > 0 ? '+' : ''}{personalInflationRate.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">Variação de preços dos produtos que compras — últimos 6 vs 6 meses anteriores</p>

          <div className="space-y-3">
            {priceInflation.map(p => (
              <div key={p.name} className="flex items-center gap-3">
                <div className="shrink-0">
                  {p.changePct > 0
                    ? <TrendingUp size={16} className="text-red-400" />
                    : <TrendingDown size={16} className="text-emerald-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    €{fmtN(p.oldPrice)} → €{fmtN(p.newPrice)}
                  </p>
                </div>
                <span
                  className="text-sm font-bold shrink-0"
                  style={{ color: p.changePct > 0 ? '#ef4444' : '#10b981' }}
                >
                  {p.changePct > 0 ? '+' : ''}{p.changePct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-3 text-gray-400">
          <TrendingUp size={24} className="shrink-0" />
          <div>
            <p className="text-sm font-medium">Inflação pessoal</p>
            <p className="text-xs mt-0.5">Aparece depois de teres produtos comprados em meses diferentes.</p>
          </div>
        </div>
      )}

      {/* Comparação entre lojas */}
      {storeComparisons.length > 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between mb-1">
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Comparação entre lojas</h2>
          </div>
          <p className="text-xs text-gray-400 mb-1">Produtos que compraste em lojas diferentes</p>
          {totalSavingsPotential > 0.01 && (
            <div className="flex items-center gap-1.5 mb-4">
              <ShoppingCart size={14} className="text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-600">
                Poupança potencial: {fmt(totalSavingsPotential)} por compra
              </p>
            </div>
          )}

          <div className="space-y-4">
            {storeComparisons.map(({ productName, stores: storeList, savings }) => (
              <div key={productName}>
                <p className="text-sm font-medium text-gray-800 mb-1.5 truncate">{productName}</p>
                <div className="space-y-1">
                  {storeList.map((s, i) => {
                    const isCheapest = i === 0
                    const maxPrice = storeList[storeList.length - 1].avgPrice
                    const pct = maxPrice > 0 ? (s.avgPrice / maxPrice) * 100 : 100
                    return (
                      <div key={s.name} className="flex items-center gap-2">
                        <Store size={12} className="shrink-0 text-gray-300" />
                        <span className="text-xs text-gray-600 w-24 truncate shrink-0">{s.name}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: isCheapest ? '#10b981' : '#fca5a5' }}
                          />
                        </div>
                        <span className="text-xs font-semibold shrink-0" style={{ color: isCheapest ? '#10b981' : '#6b7280' }}>
                          €{fmtN(s.avgPrice)}
                          {isCheapest && ' ✓'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {savings > 0.01 && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Poupas {fmt(savings)} por unidade na loja mais barata
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-3 text-gray-400">
          <Store size={24} className="shrink-0" />
          <div>
            <p className="text-sm font-medium">Comparação entre lojas</p>
            <p className="text-xs mt-0.5">Aparece quando comprares o mesmo produto em lojas diferentes.</p>
          </div>
        </div>
      )}
    </div>
  )
}
