import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import Scanner from './components/Scanner'
import ExpenseList from './components/ExpenseList'
import Analytics from './components/Analytics'
import QuickPay from './components/QuickPay'
import BottomNav, { type Tab } from './components/BottomNav'
import { parsePaymentText } from './lib/parsePayment'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [refresh, setRefresh] = useState(0)
  const [sharedPayment, setSharedPayment] = useState<{ amount: number | null; store: string } | null>(null)

  // Handle Web Share Target — reads URL params injected by the PWA share target
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const title = params.get('share_title') ?? ''
    const text = params.get('share_text') ?? ''
    const combined = `${title} ${text}`.trim()

    if (combined) {
      const parsed = parsePaymentText(combined)
      setSharedPayment(parsed)
      // Clean URL so refreshing doesn't re-trigger
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const handleSaved = () => {
    setSharedPayment(null)
    setRefresh(r => r + 1)
    setTab('list')
  }

  // If a payment notification was shared, show QuickPay full-screen
  if (sharedPayment) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="p-4 pt-8 space-y-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Notificação capturada</p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Confirma o pagamento</h1>
          </div>
          <QuickPay
            initial={sharedPayment}
            fromShare
            onSaved={handleSaved}
            onCancel={() => setSharedPayment(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="flex-1 overflow-y-auto pb-20">
        {tab === 'dashboard' && <Dashboard key={refresh} />}
        {tab === 'scanner' && <Scanner key={tab} onSaved={handleSaved} />}
        {tab === 'list' && <ExpenseList key={refresh} />}
        {tab === 'analytics' && <Analytics key={refresh} />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
