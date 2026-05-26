export interface ExpenseItem {
  name: string
  quantity: number
  unit_price: number
  total: number
}

export interface Expense {
  id: string
  created_at: string
  date: string
  store: string
  category: string
  amount: number
  description: string
  currency: string
  items: ExpenseItem[] | null
}

export type ExpenseInsert = Omit<Expense, 'id' | 'created_at'>

export const CATEGORIES = [
  'Supermercado',
  'Restaurante',
  'Transporte',
  'Saúde',
  'Lazer',
  'Vestuário',
  'Casa',
  'Farmácia',
  'Gasolina',
  'Outros',
]

export const CATEGORY_EMOJI: Record<string, string> = {
  Supermercado: '🛒',
  Restaurante: '🍽️',
  Transporte: '🚌',
  Saúde: '🏥',
  Lazer: '🎮',
  Vestuário: '👕',
  Casa: '🏠',
  Farmácia: '💊',
  Gasolina: '⛽',
  Outros: '📦',
}

export const CATEGORY_COLOR: Record<string, string> = {
  Supermercado: '#10b981',
  Restaurante: '#f97316',
  Transporte: '#3b82f6',
  Saúde: '#ef4444',
  Lazer: '#a855f7',
  Vestuário: '#ec4899',
  Casa: '#eab308',
  Farmácia: '#14b8a6',
  Gasolina: '#6b7280',
  Outros: '#94a3b8',
}
