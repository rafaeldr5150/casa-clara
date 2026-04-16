import { seedState } from '../data/seed';
import { getCurrentUser, isSupabaseEnabled, supabase } from './supabase';
import type { AppState, Category, HouseholdMemberItem, HouseholdSummaryItem, Transaction } from './types';

const STORAGE_KEY = 'casa-clara-state';

async function ensureRemoteBaseline(userId: string, userName: string) {
  if (!supabase) return;

  const householdId = userId;

  const { error: householdError } = await supabase
    .from('households')
    .upsert({
      id: householdId,
      owner_id: userId,
      name: `Casa de ${userName}`,
      currency: 'BRL',
    });

  if (householdError) {
    throw new Error(`Falha ao criar grupo inicial: ${householdError.message}`);
  }

  const { error: memberError } = await supabase.from('household_members').upsert({
    household_id: householdId,
    user_id: userId,
    display_name: userName,
    role: 'owner',
  });

  if (memberError) {
    throw new Error(`Falha ao criar membro inicial: ${memberError.message}`);
  }

  const { count, error: countError } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId);

  if (countError) {
    throw new Error(`Falha ao verificar categorias iniciais: ${countError.message}`);
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const { error: seedError } = await supabase.from('categories').insert(
    seedState.categories.map((category) => ({
      id: crypto.randomUUID(),
      household_id: householdId,
      name: category.name,
      color: category.color,
      icon: category.icon,
      kind: category.kind,
      is_default: true,
    })),
  );

  if (seedError) {
    throw new Error(`Falha ao criar categorias iniciais: ${seedError.message}`);
  }
}

function normalizeInviteCode(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function getOrCreateUserHouseholds(userId: string, userName: string): Promise<HouseholdSummaryItem[]> {
  if (!supabase) {
    return [];
  }

  await ensureRemoteBaseline(userId, userName);

  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, households(id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Nao foi possivel carregar os grupos do usuario: ${error.message}`);
  }

  return (data ?? [])
    .map((item) => {
      const household = Array.isArray(item.households) ? item.households[0] : item.households;
      if (!household?.id) return null;
      return {
        id: household.id,
        name: household.name,
        role: item.role as 'owner' | 'member',
      };
    })
    .filter((item): item is HouseholdSummaryItem => Boolean(item));
}

async function pickBestHouseholdId(
  households: HouseholdSummaryItem[],
  activeHouseholdId?: string,
): Promise<string> {
  if (!households.length || !supabase) {
    return '';
  }

  if (activeHouseholdId && households.some((item) => item.id === activeHouseholdId)) {
    return activeHouseholdId;
  }

  const householdIds = households.map((item) => item.id);
  const { data, error } = await supabase
    .from('transactions')
    .select('household_id')
    .in('household_id', householdIds);

  if (error) {
    return households[0].id;
  }

  const countByHouseholdId = (data ?? []).reduce<Record<string, number>>((accumulator, item) => {
    const householdId = item.household_id as string;
    accumulator[householdId] = (accumulator[householdId] ?? 0) + 1;
    return accumulator;
  }, {});

  const ranked = [...households].sort(
    (left, right) => (countByHouseholdId[right.id] ?? 0) - (countByHouseholdId[left.id] ?? 0),
  );

  return ranked[0].id;
}

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
  paid_by: string;
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

export async function loadState(activeHouseholdId?: string): Promise<AppState> {
  if (!isSupabaseEnabled || !supabase) {
    return loadLocalState();
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }

  const userId = user.id;
  const userName =
    typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim().length > 0
      ? user.user_metadata.name
      : user.email?.split('@')[0] ?? 'Usuario';

  const households = await getOrCreateUserHouseholds(userId, userName);
  if (!households.length) {
    throw new Error('Usuario sem grupo associado.');
  }

  const householdId = await pickBestHouseholdId(households, activeHouseholdId);

  const [categoriesResult, transactionsResult] = await Promise.all([
    supabase.from('categories').select('*').eq('household_id', householdId).order('name'),
    supabase.from('transactions').select('*').eq('household_id', householdId).order('transaction_date', { ascending: false }),
  ]);

  if (categoriesResult.error || transactionsResult.error) {
    const details = [categoriesResult.error?.message, transactionsResult.error?.message].filter(Boolean).join(' | ');
    throw new Error(`Nao foi possivel carregar dados do usuario no Supabase: ${details}`);
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

export function subscribeToRealtime(householdId: string, onChange: () => void) {
  if (!isSupabaseEnabled || !supabase || !householdId) {
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

export async function getUserHouseholds(): Promise<HouseholdSummaryItem[]> {
  if (!isSupabaseEnabled || !supabase) {
    return [
      {
        id: seedState.householdId,
        name: 'Casa Local',
        role: 'owner',
      },
    ];
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }

  const userName =
    typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim().length > 0
      ? user.user_metadata.name
      : user.email?.split('@')[0] ?? 'Usuario';

  return getOrCreateUserHouseholds(user.id, userName);
}

export async function createHouseholdInvite(householdId: string) {
  if (!isSupabaseEnabled || !supabase) {
    throw new Error('Convites estao disponiveis apenas com Supabase.');
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('household_invites').insert({
    household_id: householdId,
    code,
    created_by: user.id,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error('Nao foi possivel gerar convite.');
  }

  return code;
}

export async function joinHouseholdByInviteCode(code: string) {
  if (!isSupabaseEnabled || !supabase) {
    throw new Error('Convites estao disponiveis apenas com Supabase.');
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }

  const userName =
    typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim().length > 0
      ? user.user_metadata.name
      : user.email?.split('@')[0] ?? 'Usuario';

  const normalizedCode = normalizeInviteCode(code);
  const { data: invite, error: inviteError } = await supabase
    .from('household_invites')
    .select('household_id, expires_at')
    .eq('code', normalizedCode)
    .maybeSingle();

  if (inviteError || !invite) {
    throw new Error('Codigo de convite invalido.');
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new Error('Codigo de convite expirado.');
  }

  const { error } = await supabase.from('household_members').upsert({
    household_id: invite.household_id,
    user_id: user.id,
    display_name: userName,
    role: 'member',
  });

  if (error) {
    throw new Error('Nao foi possivel entrar no grupo.');
  }

  return invite.household_id;
}

export async function listHouseholdMembers(householdId: string): Promise<HouseholdMemberItem[]> {
  if (!isSupabaseEnabled || !supabase) {
    return [{ userId: 'local-user', name: 'Voce', role: 'owner' }];
  }

  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, role, display_name')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Nao foi possivel listar membros do grupo.');
  }

  return (data ?? []).map((item) => ({
    userId: item.user_id,
    name: item.display_name || 'Usuario',
    role: item.role as 'owner' | 'member',
  }));
}

export async function renameHousehold(householdId: string, name: string) {
  if (!isSupabaseEnabled || !supabase) {
    return;
  }

  const { error } = await supabase
    .from('households')
    .update({ name: name.trim() })
    .eq('id', householdId);

  if (error) {
    throw new Error('Nao foi possivel atualizar o nome do grupo.');
  }
}

export async function removeMemberFromHousehold(householdId: string, userId: string) {
  if (!isSupabaseEnabled || !supabase) {
    return;
  }

  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .eq('role', 'member');

  if (error) {
    throw new Error('Nao foi possivel remover o convidado.');
  }
}