import { seedState } from '../data/seed';
import { isSupabaseEnabled, supabase } from './supabase';
import type { AppState, Category, Transaction } from './types';

const STORAGE_KEY = 'casa-clara-state';
const householdId = import.meta.env.VITE_SUPABASE_HOUSEHOLD_ID ?? seedState.householdId;

function mapCategoryFromRemote(category: {
  id: string;
  household_id: string;
  name: string;
  color: string;
  icon: string;
  kind: 'expense' | 'income';
  is_default: boolean;
}): Category {
  return {
    id: category.id,
    householdId: category.household_id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    kind: category.kind,
    isDefault: category.is_default,
  };
}

function mapTransactionFromRemote(transaction: {
  id: string;
  household_id: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  category_id: string;
  paid_by: 'Rafael' | 'Karina';
  transaction_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): Transaction {
  return {
    id: transaction.id,
    householdId: transaction.household_id,
    description: transaction.description,
    amount: Number(transaction.amount),
    type: transaction.type,
    categoryId: transaction.category_id,
    paidBy: transaction.paid_by,
    transactionDate: transaction.transaction_date,
    notes: transaction.notes ?? '',
    createdAt: transaction.created_at,
    updatedAt: transaction.updated_at,
  };
}

function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedState));
    return seedState;
  }

  try {
    return JSON.parse(raw) as AppState;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedState));
    return seedState;
  }
}

function saveLocalState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadState(): Promise<AppState> {
  if (!isSupabaseEnabled || !supabase) {
    return loadLocalState();
  }

  const [categoriesResult, transactionsResult] = await Promise.all([
    supabase.from('categories').select('*').eq('household_id', householdId).order('name'),
    supabase.from('transactions').select('*').eq('household_id', householdId).order('transaction_date', { ascending: false }),
  ]);

  if (categoriesResult.error || transactionsResult.error) {
    return loadLocalState();
  }

  return {
    householdId,
    categories: categoriesResult.data.map(mapCategoryFromRemote),
    transactions: transactionsResult.data.map(mapTransactionFromRemote),
  };
}

export async function upsertCategory(category: Category) {
  if (!isSupabaseEnabled || !supabase) {
    const state = loadLocalState();
    const existingIndex = state.categories.findIndex((item) => item.id === category.id);
    if (existingIndex >= 0) {
      state.categories[existingIndex] = category;
    } else {
      state.categories.unshift(category);
    }
    saveLocalState(state);
    return;
  }

  await supabase.from('categories').upsert({
    id: category.id,
    household_id: category.householdId,
    name: category.name,
    color: category.color,
    icon: category.icon,
    kind: category.kind,
    is_default: category.isDefault,
  });
}

export async function saveTransaction(transaction: Transaction) {
  if (!isSupabaseEnabled || !supabase) {
    const state = loadLocalState();
    const existingIndex = state.transactions.findIndex((item) => item.id === transaction.id);
    if (existingIndex >= 0) {
      state.transactions[existingIndex] = transaction;
    } else {
      state.transactions.unshift(transaction);
    }
    saveLocalState(state);
    return;
  }

  await supabase.from('transactions').upsert({
    id: transaction.id,
    household_id: transaction.householdId,
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    category_id: transaction.categoryId,
    paid_by: transaction.paidBy,
    transaction_date: transaction.transactionDate,
    notes: transaction.notes,
    created_at: transaction.createdAt,
    updated_at: transaction.updatedAt,
  });
}

export async function deleteCategory(id: string) {
  if (!isSupabaseEnabled || !supabase) {
    const state = loadLocalState();
    saveLocalState({ ...state, categories: state.categories.filter((item) => item.id !== id) });
    return;
  }
  await supabase.from('categories').delete().eq('id', id);
}

export async function removeTransaction(id: string) {
  if (!isSupabaseEnabled || !supabase) {
    const state = loadLocalState();
    saveLocalState({
      ...state,
      transactions: state.transactions.filter((item) => item.id !== id),
    });
    return;
  }

  await supabase.from('transactions').delete().eq('id', id);
}

export function subscribeToRealtime(onChange: () => void) {
  if (!isSupabaseEnabled || !supabase) {
    return () => undefined;
  }

  const client = supabase;

  const channel = client
    .channel(`household-${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions', filter: `household_id=eq.${householdId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories', filter: `household_id=eq.${householdId}` },
      onChange,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}