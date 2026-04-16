import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
}

export async function signUpWithPassword(email: string, password: string, name: string) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
      },
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function invokeFinancialAdvisor(payload: {
  householdName: string;
  selectedMonth: string;
  focus: string;
  preferredAddress: 'cavalheiro' | 'gatinha';
  snapshot: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    topCategoryName: string;
    topCategoryAmount: number;
    topCategoryShare: number;
    transactionsCount: number;
  };
  recommendations: Array<{
    title: string;
    detail: string;
    action: string;
    priority: string;
  }>;
  recentTransactions: Array<{
    description: string;
    amount: number;
    type: string;
    categoryName: string;
    paidBy: string;
    transactionDate: string;
  }>;
  messages: Array<{
    role: 'assistant' | 'user';
    text: string;
  }>;
}) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { data, error } = await supabase.functions.invoke('financial-advisor', {
    body: payload,
  });

  if (error) {
    throw error;
  }

  return data as { reply: string };
}