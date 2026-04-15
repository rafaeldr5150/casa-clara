import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Car,
  CheckCircle,
  CreditCard,
  HeartPulse,
  Home,
  PencilLine,
  Plus,
  ReceiptText,
  Save,
  ShoppingBasket,
  Ticket,
  TrendingDown,
  TrendingUp,
  Trash2,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, formatMonthLabel, formatShortDate, startOfCurrentMonth, toMonthKey } from './lib/format';
import { seedState } from './data/seed';
import { isSupabaseEnabled } from './lib/supabase';
import { deleteCategory, loadState, removeTransaction, saveTransaction, subscribeToRealtime, upsertCategory } from './lib/storage';
import type { AppState, Category, EntryType, HouseholdUser, MonthlySummary, Transaction } from './lib/types';

const iconMap = {
  Home,
  ShoppingBasket,
  Car,
  Ticket,
  HeartPulse,
  Wallet,
  ReceiptText,
  CreditCard,
};

const defaultUsers: HouseholdUser[] = ['Rafael', 'Karina'];

const emptyTransactionForm = {
  description: '',
  amount: '',
  type: 'expense' as EntryType,
  categoryId: seedState.categories[0].id,
  paidBy: 'Rafael' as HouseholdUser,
  transactionDate: new Date().toISOString().slice(0, 10),
  notes: '',
};

function buildMonthlySummary(
  transactions: Transaction[],
  categories: Category[],
  monthKey: string,
): MonthlySummary {
  const monthTransactions = transactions.filter((item) => toMonthKey(item.transactionDate) === monthKey);
  const previousMonthDate = new Date(`${monthKey}-01T00:00:00`);
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
  const previousMonthKey = previousMonthDate.toISOString().slice(0, 7);
  const previousMonthExpenses = transactions
    .filter((item) => item.type === 'expense' && toMonthKey(item.transactionDate) === previousMonthKey)
    .reduce((total, item) => total + item.amount, 0);

  const totalExpenses = monthTransactions
    .filter((item) => item.type === 'expense')
    .reduce((total, item) => total + item.amount, 0);
  const totalIncome = monthTransactions
    .filter((item) => item.type === 'income')
    .reduce((total, item) => total + item.amount, 0);

  const totalsByCategory = monthTransactions
    .filter((item) => item.type === 'expense')
    .reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.categoryId] = (accumulator[item.categoryId] ?? 0) + item.amount;
      return accumulator;
    }, {});

  const [topCategoryId, topCategoryAmount] = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const topCategoryName = categories.find((item) => item.id === topCategoryId)?.name ?? 'Sem destaque';
  const uniqueExpenseDays = new Set(
    monthTransactions.filter((item) => item.type === 'expense').map((item) => item.transactionDate),
  ).size || 1;

  return {
    totalExpenses,
    totalIncome,
    balance: totalIncome - totalExpenses,
    averageDailyExpense: totalExpenses / uniqueExpenseDays,
    topCategoryName,
    topCategoryAmount,
    previousMonthDelta: totalExpenses - previousMonthExpenses,
  };
}

function makeId(_prefix: string) {
  return crypto.randomUUID();
}

function buildPredictions(
  transactions: Transaction[],
  monthKey: string,
): {
  projectedTotal: number;
  currentDailyRate: number;
  avgDailyHistorical: number;
  daysRemaining: number;
  burnRatePercent: number;
  hasEnoughData: boolean;
  isCurrentMonth: boolean;
  daysInMonth: number;
  dayOfMonth: number;
} {
  const today = new Date();
  const currentMonthKey = startOfCurrentMonth();
  const isCurrentMonth = monthKey === currentMonthKey;
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysRemaining = isCurrentMonth ? Math.max(0, daysInMonth - dayOfMonth) : 0;

  const currentMonthExpenses = transactions
    .filter((t) => t.type === 'expense' && toMonthKey(t.transactionDate) === monthKey)
    .reduce((sum, t) => sum + t.amount, 0);

  const historicalMonths: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(year, month - 1 - i, 1);
    historicalMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const historicalExpenses = transactions.filter(
    (t) => t.type === 'expense' && historicalMonths.includes(toMonthKey(t.transactionDate)),
  );
  const historicalTotal = historicalExpenses.reduce((sum, t) => sum + t.amount, 0);
  const monthsWithData = new Set(historicalExpenses.map((t) => toMonthKey(t.transactionDate))).size;
  const hasEnoughData = monthsWithData >= 1;

  let totalHistoricalDays = 0;
  for (const mk of historicalMonths) {
    const [hy, hm] = mk.split('-').map(Number);
    if (historicalExpenses.some((t) => toMonthKey(t.transactionDate) === mk)) {
      totalHistoricalDays += new Date(hy, hm, 0).getDate();
    }
  }

  const avgDailyHistorical = totalHistoricalDays > 0 ? historicalTotal / totalHistoricalDays : 0;
  const currentDailyRate = dayOfMonth > 0 ? currentMonthExpenses / dayOfMonth : 0;
  const blendedDailyRate =
    isCurrentMonth && dayOfMonth >= 7
      ? currentDailyRate * 0.6 + avgDailyHistorical * 0.4
      : avgDailyHistorical;

  const projectedTotal = currentMonthExpenses + blendedDailyRate * daysRemaining;
  const avgMonthlyHistorical = monthsWithData > 0 ? historicalTotal / monthsWithData : 0;
  const burnRatePercent = avgMonthlyHistorical > 0 ? (projectedTotal / avgMonthlyHistorical) * 100 : 100;

  return {
    projectedTotal,
    currentDailyRate,
    avgDailyHistorical,
    daysRemaining,
    burnRatePercent,
    hasEnoughData,
    isCurrentMonth,
    daysInMonth,
    dayOfMonth,
  };
}

function buildInsights(
  transactions: Transaction[],
  categories: Category[],
  monthKey: string,
  users: readonly HouseholdUser[],
): { text: string; kind: 'info' | 'warning' | 'positive' }[] {
  const insights: { text: string; kind: 'info' | 'warning' | 'positive' }[] = [];

  const [year, month] = monthKey.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const currentExpenses = transactions.filter(
    (t) => t.type === 'expense' && toMonthKey(t.transactionDate) === monthKey,
  );
  const prevExpenses = transactions.filter(
    (t) => t.type === 'expense' && toMonthKey(t.transactionDate) === prevMonthKey,
  );
  const currentIncome = transactions
    .filter((t) => t.type === 'income' && toMonthKey(t.transactionDate) === monthKey)
    .reduce((sum, t) => sum + t.amount, 0);

  const currentTotal = currentExpenses.reduce((sum, t) => sum + t.amount, 0);
  const prevTotal = prevExpenses.reduce((sum, t) => sum + t.amount, 0);

  if (prevTotal > 0 && currentTotal > 0) {
    const delta = ((currentTotal - prevTotal) / prevTotal) * 100;
    if (delta > 10) {
      insights.push({ text: `Gasto ${Math.round(delta)}% acima do mes anterior`, kind: 'warning' });
    } else if (delta < -10) {
      insights.push({ text: `Gasto ${Math.round(Math.abs(delta))}% abaixo do mes anterior`, kind: 'positive' });
    } else {
      insights.push({ text: `Gasto estavel — variacao de ${Math.round(Math.abs(delta))}% vs mes anterior`, kind: 'info' });
    }
  }

  const currentByCat = currentExpenses.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoryId] = (acc[t.categoryId] ?? 0) + t.amount;
    return acc;
  }, {});
  const prevByCat = prevExpenses.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoryId] = (acc[t.categoryId] ?? 0) + t.amount;
    return acc;
  }, {});

  let biggestRiseCatId = '';
  let biggestRisePct = 0;
  for (const [catId, amount] of Object.entries(currentByCat)) {
    const prev = prevByCat[catId] ?? 0;
    if (prev > 0) {
      const pct = ((amount - prev) / prev) * 100;
      if (pct > biggestRisePct) { biggestRisePct = pct; biggestRiseCatId = catId; }
    }
  }
  if (biggestRiseCatId && biggestRisePct > 15) {
    const catName = categories.find((c) => c.id === biggestRiseCatId)?.name ?? '';
    insights.push({ text: `${catName} subiu ${Math.round(biggestRisePct)}% em relacao ao mes anterior`, kind: 'warning' });
  }

  if (users.length >= 2) {
    const [u1, u2] = users;
    const u1Total = currentExpenses.filter((t) => t.paidBy === u1).reduce((s, t) => s + t.amount, 0);
    const u2Total = currentExpenses.filter((t) => t.paidBy === u2).reduce((s, t) => s + t.amount, 0);
    const diff = Math.abs(u1Total - u2Total);
    if (diff > 100) {
      const leader = u1Total >= u2Total ? u1 : u2;
      insights.push({ text: `${leader} pagou ${formatCurrency(diff)} a mais este mes`, kind: 'info' });
    }
  }

  if (currentExpenses.length > 0) {
    const biggest = currentExpenses.reduce((max, t) => (t.amount > max.amount ? t : max));
    insights.push({ text: `Maior gasto: "${biggest.description}" — ${formatCurrency(biggest.amount)}`, kind: 'info' });
  }

  if (currentIncome > 0 && currentTotal > 0) {
    const pct = Math.round((currentTotal / currentIncome) * 100);
    const kind: 'warning' | 'info' | 'positive' = pct > 90 ? 'warning' : pct > 70 ? 'info' : 'positive';
    insights.push({ text: `${pct}% da renda registrada ja foi comprometida`, kind });
  }

  return insights;
}

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(startOfCurrentMonth());
  const [transactionForm, setTransactionForm] = useState(emptyTransactionForm);
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#355c7d');
  const [categoryType, setCategoryType] = useState<EntryType>('expense');
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'local' | 'online'>(isSupabaseEnabled ? 'online' : 'local');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryColor, setEditCategoryColor] = useState('#355c7d');
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const state = await loadState();
      if (!mounted) {
        return;
      }
      setAppState(state);
      setTransactionForm((current) => ({
        ...current,
        categoryId: state.categories.find((item) => item.kind === current.type)?.id ?? state.categories[0]?.id ?? '',
      }));
    };

    void initialize();
    const unsubscribe = subscribeToRealtime(() => {
      setSyncStatus('online');
      void initialize();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const categories = appState?.categories ?? [];
  const transactions = appState?.transactions ?? [];

  useEffect(() => {
    if (!categories.length) {
      return;
    }

    const hasSelectedCategory = categories.some((item) => item.id === transactionForm.categoryId && item.kind === transactionForm.type);
    if (!hasSelectedCategory) {
      const fallbackCategory = categories.find((item) => item.kind === transactionForm.type);
      if (fallbackCategory) {
        setTransactionForm((current) => ({ ...current, categoryId: fallbackCategory.id }));
      }
    }
  }, [categories, transactionForm.categoryId, transactionForm.type]);

  const monthTransactions = useMemo(
    () => transactions.filter((item) => toMonthKey(item.transactionDate) === selectedMonth),
    [selectedMonth, transactions],
  );

  const monthlySummary = useMemo(
    () => buildMonthlySummary(transactions, categories, selectedMonth),
    [categories, selectedMonth, transactions],
  );

  const donutData = useMemo(() => {
    const totals = monthTransactions
      .filter((item) => item.type === 'expense')
      .reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.categoryId] = (accumulator[item.categoryId] ?? 0) + item.amount;
        return accumulator;
      }, {});

    return Object.entries(totals)
      .map(([categoryId, value]) => {
        const category = categories.find((item) => item.id === categoryId);
        return {
          name: category?.name ?? 'Sem categoria',
          value,
          color: category?.color ?? '#94a3b8',
        };
      })
      .sort((left, right) => right.value - left.value);
  }, [categories, monthTransactions]);

  const dailyTrend = useMemo(() => {
    const totals = monthTransactions.reduce<Record<string, number>>((accumulator, item) => {
      const signal = item.type === 'expense' ? item.amount : -item.amount;
      accumulator[item.transactionDate] = (accumulator[item.transactionDate] ?? 0) + signal;
      return accumulator;
    }, {});

    return Object.entries(totals)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, total]) => ({
        date: formatShortDate(date),
        total,
      }));
  }, [monthTransactions]);

  const paidByData = useMemo(
    () =>
      defaultUsers.map((user) => ({
        name: user,
        total: monthTransactions
          .filter((item) => item.type === 'expense' && item.paidBy === user)
          .reduce((sum, item) => sum + item.amount, 0),
      })),
    [monthTransactions],
  );

  const monthlyOptions = useMemo(() => {
    const keys = new Set(transactions.map((item) => toMonthKey(item.transactionDate)));
    keys.add(startOfCurrentMonth());
    return Array.from(keys).sort((left, right) => right.localeCompare(left));
  }, [transactions]);

  const filteredCategories = categories.filter((item) => item.kind === transactionForm.type);

  const transactionCountByCategory = useMemo(
    () =>
      transactions.reduce<Record<string, number>>((acc, t) => {
        acc[t.categoryId] = (acc[t.categoryId] ?? 0) + 1;
        return acc;
      }, {}),
    [transactions],
  );

  const predictions = useMemo(
    () => buildPredictions(transactions, selectedMonth),
    [transactions, selectedMonth],
  );

  const insights = useMemo(
    () => buildInsights(transactions, categories, selectedMonth, defaultUsers),
    [transactions, categories, selectedMonth],
  );

  async function refreshState() {
    const nextState = await loadState();
    setAppState(nextState);
  }

  async function handleTransactionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!appState) return;

    if (!transactionForm.description.trim()) {
      setFormError('Preencha a descricao do movimento.');
      return;
    }

    const amount = Number(transactionForm.amount.replace(',', '.'));
    if (!transactionForm.amount.trim() || Number.isNaN(amount) || amount <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }

    if (!transactionForm.transactionDate) {
      setFormError('Selecione a data do movimento.');
      return;
    }

    setSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const transaction: Transaction = {
        id: editingTransactionId ?? makeId('txn'),
        householdId: appState.householdId,
        description: transactionForm.description.trim(),
        amount,
        type: transactionForm.type,
        categoryId: transactionForm.categoryId,
        paidBy: transactionForm.paidBy,
        transactionDate: transactionForm.transactionDate,
        notes: transactionForm.notes.trim(),
        createdAt: editingTransactionId
          ? transactions.find((item) => item.id === editingTransactionId)?.createdAt ?? timestamp
          : timestamp,
        updatedAt: timestamp,
      };

      await saveTransaction(transaction);
      await refreshState();
      setEditingTransactionId(null);
      setFormError(null);
      setTransactionForm({
        ...emptyTransactionForm,
        categoryId: categories.find((item) => item.kind === 'expense')?.id ?? '',
        transactionDate: new Date().toISOString().slice(0, 10),
      });
    } catch (error) {
      setFormError('Erro ao salvar. Tente novamente.');
      console.error('[handleTransactionSubmit]', error);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditTransaction(transaction: Transaction) {
    setEditingTransactionId(transaction.id);
    setTransactionForm({
      description: transaction.description,
      amount: String(transaction.amount),
      type: transaction.type,
      categoryId: transaction.categoryId,
      paidBy: transaction.paidBy,
      transactionDate: transaction.transactionDate,
      notes: transaction.notes,
    });
  }

  async function handleDeleteTransaction(id: string) {
    await removeTransaction(id);
    if (editingTransactionId === id) {
      setEditingTransactionId(null);
      setTransactionForm({
        ...emptyTransactionForm,
        categoryId: categories.find((item) => item.kind === 'expense')?.id ?? '',
      });
    }
    await refreshState();
  }

  async function handleCategorySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appState || !categoryName.trim()) {
      return;
    }
    setCategoryError(null);

    await upsertCategory({
      id: makeId('cat'),
      householdId: appState.householdId,
      name: categoryName.trim(),
      color: categoryColor,
      icon: categoryType === 'expense' ? 'CreditCard' : 'Wallet',
      kind: categoryType,
      isDefault: false,
    });

    setCategoryName('');
    await refreshState();
  }

  function handleStartEditCategory(category: Category) {
    setEditingCategoryId(category.id);
    setEditCategoryName(category.name);
    setEditCategoryColor(category.color);
    setCategoryError(null);
  }

  async function handleSaveCategoryEdit(category: Category) {
    if (!editCategoryName.trim()) return;
    await upsertCategory({ ...category, name: editCategoryName.trim(), color: editCategoryColor });
    setEditingCategoryId(null);
    await refreshState();
  }

  async function handleDeleteCategory(category: Category) {
    const inUse = transactions.some((t) => t.categoryId === category.id);
    if (inUse) {
      setCategoryError(`"${category.name}" possui transacoes vinculadas e nao pode ser removida.`);
      return;
    }
    await deleteCategory(category.id);
    await refreshState();
  }

  if (!appState) {
    return <div className="loading-screen">Carregando painel financeiro...</div>;
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="hero">
        <div>
          <span className="eyebrow">Financeiro compartilhado para casal</span>
          <h1>Casa Clara</h1>
          <p>
            Registre gastos em segundos, acompanhe o mes com clareza e mantenha o historico financeiro dos dois no
            mesmo lugar.
          </p>
        </div>

        <div className="hero-actions">
          <div className="sync-pill">
            {syncStatus === 'online' ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{syncStatus === 'online' ? 'Supabase conectado' : 'Modo local ativo'}</span>
          </div>

          <div className="month-selector">
            <label htmlFor="month-select">Mes</label>
            <select id="month-select" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {monthlyOptions.map((monthKey) => (
                <option key={monthKey} value={monthKey}>
                  {formatMonthLabel(new Date(`${monthKey}-01T00:00:00`))}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel panel-highlight">
          <div className="section-heading">
            <div>
              <span className="section-label">Resumo mensal</span>
              <h2>Visao rapida do mes</h2>
            </div>
          </div>

          <div className="summary-grid">
            <article className="summary-card tone-expense">
              <span>Gastos</span>
              <strong>{formatCurrency(monthlySummary.totalExpenses)}</strong>
              <small>{monthlySummary.previousMonthDelta >= 0 ? 'Acima' : 'Abaixo'} do mes anterior</small>
            </article>

            <article className="summary-card tone-income">
              <span>Entradas</span>
              <strong>{formatCurrency(monthlySummary.totalIncome)}</strong>
              <small>Receita registrada no mes</small>
            </article>

            <article className="summary-card tone-balance">
              <span>Saldo</span>
              <strong>{formatCurrency(monthlySummary.balance)}</strong>
              <small>Receitas menos despesas</small>
            </article>

            <article className="summary-card tone-focus">
              <span>Categoria em destaque</span>
              <strong>{monthlySummary.topCategoryName}</strong>
              <small>{formatCurrency(monthlySummary.topCategoryAmount)}</small>
            </article>
          </div>

          <div className="insight-strip">
            <div>
              <span>Media diaria</span>
              <strong>{formatCurrency(monthlySummary.averageDailyExpense)}</strong>
            </div>
            <div>
              <span>Comparacao</span>
              <strong>{formatCurrency(Math.abs(monthlySummary.previousMonthDelta))}</strong>
            </div>
            <div>
              <span>Leitura automatica</span>
              <strong>
                {monthlySummary.topCategoryName === 'Sem destaque'
                  ? 'Adicione mais gastos para gerar insights'
                  : `${monthlySummary.topCategoryName} lidera o mes`}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel form-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Lancamento rapido</span>
              <h2>{editingTransactionId ? 'Editar movimento' : 'Novo gasto ou entrada'}</h2>
            </div>
            <Plus size={18} />
          </div>

          <form className="transaction-form" onSubmit={handleTransactionSubmit}>
            <label>
              Descricao
              <input
                value={transactionForm.description}
                onChange={(event) => setTransactionForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Ex.: Mercado, farmacia, salario"
              />
            </label>

            <div className="form-row two-columns">
              <label>
                Valor
                <input
                  inputMode="decimal"
                  value={transactionForm.amount}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0,00"
                />
              </label>

              <label>
                Tipo
                <select
                  value={transactionForm.type}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      type: event.target.value as EntryType,
                    }))
                  }
                >
                  <option value="expense">Gasto</option>
                  <option value="income">Entrada</option>
                </select>
              </label>
            </div>

            <div className="form-row two-columns">
              <label>
                Categoria
                <select
                  value={transactionForm.categoryId}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, categoryId: event.target.value }))}
                >
                  {filteredCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Pago por
                <select
                  value={transactionForm.paidBy}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      paidBy: event.target.value as HouseholdUser,
                    }))
                  }
                >
                  {defaultUsers.map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row two-columns">
              <label>
                Data
                <input
                  type="date"
                  value={transactionForm.transactionDate}
                  onChange={(event) =>
                    setTransactionForm((current) => ({ ...current, transactionDate: event.target.value }))
                  }
                />
              </label>

              <label>
                Observacoes
                <input
                  value={transactionForm.notes}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>
            </div>

            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : editingTransactionId ? 'Salvar alteracoes' : 'Registrar movimento'}
            </button>

            {formError && <p className="form-error">{formError}</p>}
          </form>
        </section>

        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Categorias</span>
              <h2>Para onde o dinheiro foi</h2>
            </div>
          </div>

          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={96} paddingAngle={3}>
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="legend-list">
            {donutData.length ? (
              donutData.map((item) => (
                <div key={item.name} className="legend-item">
                  <span className="color-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.name}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                </div>
              ))
            ) : (
              <p className="empty-state">Nenhum gasto no periodo selecionado.</p>
            )}
          </div>
        </section>

        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Evolucao</span>
              <h2>Ritmo financeiro do mes</h2>
            </div>
          </div>

          <div className="chart-frame wide-chart">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyTrend}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#355c7d" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#355c7d" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(53, 92, 125, 0.15)" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={80} tickFormatter={(value) => formatCurrency(Number(value))} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area type="monotone" dataKey="total" stroke="#355c7d" fillOpacity={1} fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Quem pagou</span>
              <h2>Distribuicao entre os dois</h2>
            </div>
          </div>

          <div className="chart-frame wide-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={paidByData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(53, 92, 125, 0.15)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={80} tickFormatter={(value) => formatCurrency(Number(value))} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="total" radius={[12, 12, 0, 0]} fill="#c06c84" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel history-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Historico</span>
              <h2>Movimentos recentes</h2>
            </div>
          </div>

          <div className="history-list">
            {monthTransactions.length ? (
              [...monthTransactions]
                .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))
                .map((transaction) => {
                  const category = categories.find((item) => item.id === transaction.categoryId);
                  const Icon = category ? iconMap[category.icon as keyof typeof iconMap] ?? CreditCard : CreditCard;

                  return (
                    <article key={transaction.id} className="transaction-item">
                      <div className="transaction-icon" style={{ backgroundColor: `${category?.color ?? '#355c7d'}20`, color: category?.color }}>
                        <Icon size={18} />
                      </div>

                      <div className="transaction-content">
                        <div className="transaction-header-line">
                          <strong>{transaction.description}</strong>
                          <span className={transaction.type === 'expense' ? 'amount-expense' : 'amount-income'}>
                            {transaction.type === 'expense' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                            {formatCurrency(transaction.amount)}
                          </span>
                        </div>

                        <div className="transaction-meta">
                          <span>{category?.name ?? 'Sem categoria'}</span>
                          <span>{formatShortDate(transaction.transactionDate)}</span>
                          <span>{transaction.paidBy}</span>
                        </div>
                      </div>

                      <div className="transaction-actions">
                        <button type="button" onClick={() => handleEditTransaction(transaction)} aria-label="Editar transacao">
                          <PencilLine size={16} />
                        </button>
                        <button type="button" onClick={() => void handleDeleteTransaction(transaction.id)} aria-label="Excluir transacao">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })
            ) : (
              <p className="empty-state">Nenhuma transacao neste mes.</p>
            )}
          </div>
        </section>

        <section className="panel category-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Categorias</span>
              <h2>Plano de contas</h2>
            </div>
          </div>
          <form className="category-form" onSubmit={handleCategorySubmit}>
            <label>
              Nova categoria
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ex.: Pets, Academia" />
            </label>
            <div className="form-row two-columns">
              <label>
                Cor
                <input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} />
              </label>
              <label>
                Tipo
                <select value={categoryType} onChange={(event) => setCategoryType(event.target.value as EntryType)}>
                  <option value="expense">Gasto</option>
                  <option value="income">Entrada</option>
                </select>
              </label>
            </div>
            <button className="secondary-button" type="submit">Adicionar categoria</button>
          </form>
          {categoryError && <p className="form-error">{categoryError}</p>}
          <div className="chips-wrap">
            {categories.map((category) =>
              editingCategoryId === category.id ? (
                <div key={category.id} className="category-edit-row">
                  <input className="edit-name-input" value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} autoFocus />
                  <input type="color" className="edit-color-input" value={editCategoryColor} onChange={(e) => setEditCategoryColor(e.target.value)} />
                  <button type="button" className="chip-action-btn save" onClick={() => void handleSaveCategoryEdit(category)} aria-label="Salvar"><Save size={13} /></button>
                  <button type="button" className="chip-action-btn cancel" onClick={() => setEditingCategoryId(null)} aria-label="Cancelar"><X size={13} /></button>
                </div>
              ) : (
                <div key={category.id} className="category-chip" style={{ borderColor: `${category.color}44` }}>
                  <span className="color-dot" style={{ backgroundColor: category.color }} />
                  <div className="chip-meta">
                    <span>{category.name}</span>
                    <small>{category.kind === 'expense' ? 'Gasto' : 'Entrada'} &middot; {transactionCountByCategory[category.id] ?? 0} mov.</small>
                  </div>
                  <div className="chip-actions">
                    <button type="button" className="chip-action-btn" onClick={() => handleStartEditCategory(category)} aria-label="Editar"><PencilLine size={13} /></button>
                    <button type="button" className="chip-action-btn danger" onClick={() => void handleDeleteCategory(category)} aria-label="Excluir"><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        <section className="panel predictions-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Inteligencia financeira</span>
              <h2>{predictions.isCurrentMonth ? 'Previsao de fechamento' : 'Resumo do mes'}</h2>
            </div>
            <TrendingUp size={18} />
          </div>

          {predictions.isCurrentMonth && predictions.hasEnoughData ? (
            <>
              <div className="prediction-hero">
                <span>Previsao ate o dia {predictions.daysInMonth}</span>
                <strong>{formatCurrency(predictions.projectedTotal)}</strong>
                <small>
                  {predictions.burnRatePercent > 110
                    ? 'Acima da media historica'
                    : predictions.burnRatePercent < 90
                    ? 'Abaixo da media historica'
                    : 'Dentro da media historica'}
                </small>
              </div>

              <div className="burn-bar-wrap">
                <div
                  className="burn-bar-fill"
                  style={{
                    width: `${Math.min(predictions.burnRatePercent, 100)}%`,
                    background:
                      predictions.burnRatePercent > 110 ? '#c06c84' : predictions.burnRatePercent > 90 ? '#f4a261' : '#2f855a',
                  }}
                />
              </div>
              <span>{Math.round(predictions.burnRatePercent)}% da media mensal historica</span>

              <div className="pred-grid">
                <div className="pred-card">
                  <span>Ritmo atual</span>
                  <strong>{formatCurrency(predictions.currentDailyRate)}<small>/dia</small></strong>
                </div>
                <div className="pred-card">
                  <span>Media historica</span>
                  <strong>{formatCurrency(predictions.avgDailyHistorical)}<small>/dia</small></strong>
                </div>
                <div className="pred-card">
                  <span>Dias restantes</span>
                  <strong>{predictions.daysRemaining}<small> dias</small></strong>
                </div>
              </div>
            </>
          ) : (
            <p className="empty-state">
              {predictions.isCurrentMonth
                ? 'Adicione gastos de meses anteriores para gerar previsoes precisas.'
                : 'Previsoes disponiveis apenas para o mes atual.'}
            </p>
          )}
        </section>

        <section className="panel insights-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">Insights automaticos</span>
              <h2>O que os numeros dizem</h2>
            </div>
          </div>

          {insights.length > 0 ? (
            <div className="insights-grid">
              {insights.map((insight, index) => (
                <div key={index} className={`insight-card kind-${insight.kind}`}>
                  {insight.kind === 'warning' ? (
                    <TrendingDown size={16} />
                  ) : insight.kind === 'positive' ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  <p>{insight.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">Adicione mais transacoes para ver insights automaticos.</p>
          )}
        </section>
      </main>
    </div>
  );
}
