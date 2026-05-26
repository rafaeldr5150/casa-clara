import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Loader2, ShoppingCart, Users, Store, ChevronDown } from 'lucide-react'
import type { Expense, ExpenseItem } from '../lib/types'

function fmtN(v: number) {
  return v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

const WAREHOUSES: { label: string; value: string }[] = [
  { label: 'Madrid', value: 'mad1' },
  { label: 'Barcelona', value: 'bcn1' },
  { label: 'Valencia', value: 'vlc1' },
  { label: 'Sevilla', value: 'svq1' },
  { label: 'Bilbao', value: 'bil1' },
  { label: 'Zaragoza', value: 'zar1' },
  { label: 'Málaga', value: 'agp1' },
  { label: 'Alicante', value: 'alc1' },
  { label: 'Murcia', value: 'mur1' },
]

interface CommunityResult {
  store: string
  avgPrice: number
  lastPrice: number
  lastDate: string
  count: number
}

interface MercadonaProduct {
  id: string
  display_name: string
  price: number
  size: string
  thumbnail: string
}

export default function PriceSearch() {
  const [query, setQuery] = useState('')
  const [warehouse, setWarehouse] = useState(() => localStorage.getItem('mercadona_warehouse') ?? 'mad1')
  const [showWarehouse, setShowWarehouse] = useState(false)
  const [loading, setLoading] = useState(false)
  const [community, setCommunity] = useState<CommunityResult[]>([])
  const [mercadona, setMercadona] = useState<MercadonaProduct[]>([])
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const changeWarehouse = (wh: string) => {
    setWarehouse(wh)
    localStorage.setItem('mercadona_warehouse', wh)
    setShowWarehouse(false)
    if (searched) runSearch(query, wh)
  }

  const runSearch = async (q: string, wh = warehouse) => {
    if (q.trim().length < 2) return
    setLoading(true)
    setSearched(true)
    setCommunity([])
    setMercadona([])

    await Promise.all([searchCommunity(q), searchMercadona(q, wh)])
    setLoading(false)
  }

  const searchCommunity = async (q: string) => {
    const { data } = await supabase
      .from('expenses')
      .select('date, store, items')
      .not('items', 'is', null)
      .order('date', { ascending: false })
      .limit(500)

    if (!data) return

    const matched: Record<string, { prices: { price: number; date: string }[]; store: string }> = {}

    ;(data as Pick<Expense, 'date' | 'store' | 'items'>[]).forEach(e => {
      e.items?.forEach((it: ExpenseItem) => {
        if (!it.unit_price || it.unit_price <= 0) return
        if (!normalize(it.name).includes(normalize(q))) return
        const key = e.store ?? 'Desconhecido'
        if (!matched[key]) matched[key] = { prices: [], store: key }
        matched[key].prices.push({ price: it.unit_price, date: e.date })
      })
    })

    const results: CommunityResult[] = Object.values(matched).map(({ store, prices }) => {
      const sorted = prices.sort((a, b) => b.date.localeCompare(a.date))
      const avg = prices.reduce((s, p) => s + p.price, 0) / prices.length
      return { store, avgPrice: avg, lastPrice: sorted[0].price, lastDate: sorted[0].date, count: prices.length }
    })

    results.sort((a, b) => a.lastPrice - b.lastPrice)
    setCommunity(results)
  }

  const searchMercadona = async (q: string, wh: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('mercadona-search', {
        body: { query: q, warehouse: wh },
      })

      if (error || !data?.results?.products) return

      const products: MercadonaProduct[] = data.results.products
        .filter((p: Record<string, unknown>) => p.price_instructions)
        .slice(0, 6)
        .map((p: Record<string, unknown>) => {
          const pi = p.price_instructions as Record<string, string>
          return {
            id: String(p.id),
            display_name: String(p.display_name),
            price: parseFloat(pi.unit_price ?? '0'),
            size: pi.size_format ?? '',
            thumbnail: String(p.thumbnail ?? ''),
          }
        })

      setMercadona(products)
    } catch {
      // Edge function not deployed yet — silently skip
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => runSearch(val), 600)
    } else {
      setSearched(false)
      setCommunity([])
      setMercadona([])
    }
  }

  const warehouseLabel = WAREHOUSES.find(w => w.value === warehouse)?.label ?? warehouse
  const cheapestCommunity = community[0]?.lastPrice
  const cheapestMercadona = mercadona[0]?.price
  const allPrices = [
    ...community.map(c => ({ label: c.store, price: c.lastPrice, source: 'community' as const })),
    ...mercadona.map(m => ({ label: `Mercadona — ${m.display_name}`, price: m.price, source: 'mercadona' as const })),
  ].sort((a, b) => a.price - b.price)

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Search header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Search size={16} className="text-emerald-500" />
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Pesquisar preço</h2>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 pr-8"
              placeholder="ex: leite, frango, arroz..."
              value={query}
              onChange={handleInput}
            />
            {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" />}
          </div>

          {/* Warehouse selector */}
          <div className="relative">
            <button
              onClick={() => setShowWarehouse(s => !s)}
              className="flex items-center gap-1 px-3 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-600 font-medium whitespace-nowrap"
            >
              {warehouseLabel}
              <ChevronDown size={13} />
            </button>
            {showWarehouse && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-32 py-1">
                {WAREHOUSES.map(w => (
                  <button
                    key={w.value}
                    onClick={() => changeWarehouse(w.value)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 font-medium"
                    style={{ color: w.value === warehouse ? '#10b981' : '#374151' }}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Best deal banner */}
      {allPrices.length > 0 && (
        <div className="mx-4 mb-3 p-3 rounded-xl flex items-center gap-2" style={{ background: '#ecfdf5' }}>
          <ShoppingCart size={16} className="text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700">
            <strong>Melhor preço:</strong> {allPrices[0].label} — €{fmtN(allPrices[0].price)}
          </p>
        </div>
      )}

      {/* Community results */}
      {community.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Users size={13} className="text-blue-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tickets scaneados</p>
          </div>
          <div className="space-y-2">
            {community.map(r => {
              const isCheapest = r.lastPrice === cheapestCommunity
              return (
                <div key={r.store} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.store}</p>
                    <p className="text-xs text-gray-400">
                      {r.count} {r.count === 1 ? 'compra' : 'compras'} · última{' '}
                      {new Date(r.lastDate + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: isCheapest ? '#10b981' : '#374151' }}>
                      €{fmtN(r.lastPrice)} {isCheapest ? '✓' : ''}
                    </p>
                    {r.count > 1 && r.avgPrice !== r.lastPrice && (
                      <p className="text-xs text-gray-400">média €{fmtN(r.avgPrice)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mercadona results */}
      {mercadona.length > 0 && (
        <div className="px-4 pb-4" style={{ borderTop: community.length > 0 ? '1px solid #f3f4f6' : 'none', paddingTop: community.length > 0 ? 12 : 0 }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Store size={13} className="text-green-500" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Mercadona online — {warehouseLabel}</p>
          </div>
          <div className="space-y-2">
            {mercadona.map(p => {
              const isCheapest = p.price === cheapestMercadona
              return (
                <div key={p.id} className="flex items-center gap-3">
                  {p.thumbnail && (
                    <img src={p.thumbnail} alt="" className="w-10 h-10 rounded-lg object-contain bg-gray-50 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.display_name}</p>
                    {p.size && <p className="text-xs text-gray-400">{p.size}</p>}
                  </div>
                  <p className="text-sm font-bold shrink-0" style={{ color: isCheapest ? '#10b981' : '#374151' }}>
                    €{fmtN(p.price)} {isCheapest ? '✓' : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {searched && !loading && community.length === 0 && mercadona.length === 0 && (
        <div className="px-4 pb-5 text-center text-gray-400">
          <p className="text-sm">Sem resultados para "{query}"</p>
          <p className="text-xs mt-1">Escaneia tickets para enriquecer a base de dados</p>
        </div>
      )}

      {!searched && (
        <p className="px-4 pb-4 text-xs text-gray-400">
          Pesquisa um produto para ver preços dos teus tickets + Mercadona em tempo real.
        </p>
      )}
    </div>
  )
}
