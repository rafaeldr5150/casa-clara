import { LayoutDashboard, Camera, Receipt, BarChart3 } from 'lucide-react'

export type Tab = 'dashboard' | 'scanner' | 'list' | 'analytics'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const tabs = [
  { id: 'dashboard' as Tab, label: 'Início', icon: LayoutDashboard },
  { id: 'scanner' as Tab, label: 'Scan', icon: Camera },
  { id: 'list' as Tab, label: 'Despesas', icon: Receipt },
  { id: 'analytics' as Tab, label: 'Análise', icon: BarChart3 },
]

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 bg-white border-t border-gray-200 flex"
      style={{ maxWidth: 480, width: '100%', left: '50%', transform: 'translateX(-50%)' }}
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors"
            style={{ color: isActive ? '#10b981' : '#9ca3af' }}
          >
            <Icon size={21} strokeWidth={isActive ? 2.5 : 1.8} />
            <span className="text-xs font-medium">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
