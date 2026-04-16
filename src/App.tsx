import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Brain,
  Car,
  CheckCircle,
  CreditCard,
  HeartPulse,
  Home,
  MessageCircle,
  PencilLine,
  Plus,
  ReceiptText,
  Save,
  SendHorizontal,
  ShoppingBasket,
  Ticket,
  Menu,
  TrendingDown,
  TrendingUp,
  Trash2,
  Users,
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
import {
  getCurrentUser,
  invokeFinancialAdvisor,
  isSupabaseEnabled,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  supabase,
} from './lib/supabase';
import {
  createHouseholdInvite,
  deleteCategory,
  getUserHouseholds,
  joinHouseholdByInviteCode,
  listHouseholdMembers,
  loadState,
  removeMemberFromHousehold,
  renameHousehold,
  removeTransaction,
  saveTransaction,
  subscribeToRealtime,
  upsertCategory,
} from './lib/storage';
import type {
  AppState,
  Category,
  EntryType,
  HouseholdMemberItem,
  HouseholdSummaryItem,
  HouseholdUser,
  MonthlySummary,
  Transaction,
} from './lib/types';

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

function buildEmptyTransactionForm(defaultPayer = '') {
  return {
  description: '',
  amount: '',
  type: 'expense' as EntryType,
  categoryId: seedState.categories[0].id,
  paidBy: defaultPayer as HouseholdUser,
  transactionDate: new Date().toISOString().slice(0, 10),
  notes: '',
  };
}

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

type AdvisorPriority = 'alta' | 'media' | 'baixa';

interface AdvisorRecommendation {
  title: string;
  detail: string;
  action: string;
  priority: AdvisorPriority;
}

interface AdvisorChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

interface AdvisorSnapshot {
  monthKey: string;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  topCategoryName: string;
  topCategoryAmount: number;
  topCategoryShare: number;
  transactionsCount: number;
}

type MobileView = 'dashboard' | 'lancamentos' | 'analises' | 'planejamento' | 'grupo';

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const femaleNameHints = new Set([
  'ana',
  'beatriz',
  'bia',
  'camila',
  'carla',
  'fernanda',
  'gabriela',
  'jessica',
  'juliana',
  'karina',
  'larissa',
  'mariana',
  'patricia',
  'rafaela',
  'renata',
  'sabrina',
  'taina',
  'vanessa',
]);

const maleNameHints = new Set([
  'alex',
  'andre',
  'bruno',
  'caio',
  'carlos',
  'daniel',
  'felipe',
  'gabriel',
  'joao',
  'jorge',
  'leonardo',
  'lucas',
  'marcos',
  'mateus',
  'paulo',
  'pedro',
  'rafael',
  'thiago',
  'vinicius',
]);

function inferAdvisorAddress(name: string): 'cavalheiro' | 'gatinha' {
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const firstName = normalized.split(/\s+/)[0] ?? '';

  if (femaleNameHints.has(firstName)) return 'gatinha';
  if (maleNameHints.has(firstName)) return 'cavalheiro';

  if (firstName.endsWith('a')) return 'gatinha';
  if (firstName.endsWith('o')) return 'cavalheiro';

  return 'cavalheiro';
}

function buildFinancialAdvisorRecommendations(
  transactions: Transaction[],
  categories: Category[],
  monthKey: string,
  focus: string,
): AdvisorRecommendation[] {
  const recommendations: AdvisorRecommendation[] = [];
  const monthExpenses = transactions.filter((t) => t.type === 'expense' && toMonthKey(t.transactionDate) === monthKey);
  const monthIncome = transactions
    .filter((t) => t.type === 'income' && toMonthKey(t.transactionDate) === monthKey)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = monthExpenses.reduce((sum, t) => sum + t.amount, 0);
  const balance = monthIncome - totalExpenses;

  const totalsByCategory = monthExpenses.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoryId] = (acc[t.categoryId] ?? 0) + t.amount;
    return acc;
  }, {});

  const sortedCategories = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];
  const topCategoryName = categories.find((c) => c.id === topCategory?.[0])?.name ?? 'Sem categoria';
  const topCategoryShare = totalExpenses > 0 && topCategory ? (topCategory[1] / totalExpenses) * 100 : 0;

  if (monthIncome <= 0) {
    recommendations.push({
      title: 'Registrar todas as entradas',
      detail: 'Sem receitas registradas no mes, o diagnostico de saude financeira fica distorcido.',
      action: 'Registre salario, freelas e outras entradas para ter indicadores reais.',
      priority: 'alta',
    });
  }

  if (monthIncome > 0) {
    const comprometimento = (totalExpenses / monthIncome) * 100;
    if (comprometimento >= 90) {
      recommendations.push({
        title: 'Comprometimento de renda muito alto',
        detail: `${Math.round(comprometimento)}% da renda do mes ja foi consumida por despesas.`,
        action: 'Defina teto semanal de gastos variaveis e pause compras nao essenciais por 2 semanas.',
        priority: 'alta',
      });
    } else if (comprometimento >= 75) {
      recommendations.push({
        title: 'Zona de atencao no fluxo mensal',
        detail: `${Math.round(comprometimento)}% da renda foi comprometida.`,
        action: 'Reduza em 10% os gastos da categoria lider para recuperar folga no caixa.',
        priority: 'media',
      });
    }
  }

  if (topCategoryShare >= 35) {
    recommendations.push({
      title: `Concentracao alta em ${topCategoryName}`,
      detail: `${Math.round(topCategoryShare)}% das despesas estao nesta categoria.`,
      action: 'Quebre essa categoria em subitens e renegocie o maior contrato associado.',
      priority: 'media',
    });
  }

  const smallExpenses = monthExpenses.filter((t) => t.amount <= 40);
  if (smallExpenses.length >= 10) {
    const smallTotal = smallExpenses.reduce((sum, t) => sum + t.amount, 0);
    recommendations.push({
      title: 'Gastos formiga relevantes',
      detail: `${smallExpenses.length} lancamentos pequenos somam ${formatCurrency(smallTotal)} no mes.`,
      action: 'Defina um limite semanal para pequenos gastos e revise no domingo.',
      priority: 'media',
    });
  }

  if (balance > 0) {
    recommendations.push({
      title: 'Momento favoravel para reserva',
      detail: `Saldo positivo de ${formatCurrency(balance)} neste mes.`,
      action: 'Direcione entre 20% e 30% do saldo para reserva de emergencia automaticamente.',
      priority: 'baixa',
    });
  }

  if (focus.trim().length > 0) {
    recommendations.push({
      title: 'Plano guiado pelo foco informado',
      detail: `Foco atual: "${focus.trim()}". O plano foi orientado para essa prioridade.`,
      action: 'Escolha 1 meta numerica para 30 dias e acompanhe semanalmente no painel.',
      priority: 'baixa',
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      title: 'Base financeira equilibrada',
      detail: 'Os dados atuais indicam boa distribuicao de gastos para o periodo analisado.',
      action: 'Mantenha revisao semanal e acompanhe variacoes de categoria no proximo mes.',
      priority: 'baixa',
    });
  }

  return recommendations.slice(0, 6);
}

function buildAdvisorSnapshot(
  transactions: Transaction[],
  categories: Category[],
  monthKey: string,
): AdvisorSnapshot {
  const monthTransactions = transactions.filter((t) => toMonthKey(t.transactionDate) === monthKey);
  const totalIncome = monthTransactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenseItems = monthTransactions.filter((t) => t.type === 'expense');
  const totalExpenses = expenseItems.reduce((sum, t) => sum + t.amount, 0);
  const totalsByCategory = expenseItems.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoryId] = (acc[t.categoryId] ?? 0) + t.amount;
    return acc;
  }, {});
  const [topCategoryId, topCategoryAmount] = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const topCategoryName = categories.find((c) => c.id === topCategoryId)?.name ?? 'Sem categoria';
  const topCategoryShare = totalExpenses > 0 ? (topCategoryAmount / totalExpenses) * 100 : 0;

  return {
    monthKey,
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    topCategoryName,
    topCategoryAmount,
    topCategoryShare,
    transactionsCount: monthTransactions.length,
  };
}

function buildAdvisorReply(
  question: string,
  snapshot: AdvisorSnapshot,
  recommendations: AdvisorRecommendation[],
  addressTerm: 'cavalheiro' | 'gatinha',
): string {
  const q = question.trim().toLowerCase();
  const topAction = recommendations[0]?.action ?? 'mantenha revisao semanal e acompanhe as categorias lideres.';
  const worriedTone = /(desesper|preocup|apert|devend|sem dinheiro|ferrad|caos|atras|problema)/.test(q);
  const intro = worriedTone
    ? `Calma, ${addressTerm}. Vamos dizer assim: isso se resolve no passo a passo.`
    : 'Vamos dizer assim...';
  const confidentClosers = [
    `Segue nesse ritmo que a casa entra no eixo, ${addressTerm}.`,
    'Voce ta mandando bem por olhar os numeros com calma. Que se lixe a correria, aqui e estrategia.',
    `Mantendo esse foco, o financeiro responde rapido, ${addressTerm}.`,
  ];
  const closer = worriedTone
    ? 'Foca no proximo passo pratico que o jogo vira.'
    : confidentClosers[Math.floor(Math.random() * confidentClosers.length)];

  if (!q) {
    return 'Eu sou o Rodrigao do planejamento domestico. Vamos dizer assim: te ajudo com metas, economia, fluxo do mes e corte de gasto sem enrolacao.';
  }

  if (q.includes('resumo') || q.includes('situacao') || q.includes('como estamos')) {
    return `${intro} resumo de ${snapshot.monthKey}: receitas ${formatCurrency(snapshot.totalIncome)}, despesas ${formatCurrency(snapshot.totalExpenses)} e saldo ${formatCurrency(snapshot.balance)}.\n\nA fase mais pesada do jogo ta em ${snapshot.topCategoryName}, com ${formatCurrency(snapshot.topCategoryAmount)} (${Math.round(snapshot.topCategoryShare)}% dos gastos). ${closer}`;
  }

  if (q.includes('econom') || q.includes('reduzir') || q.includes('cortar') || q.includes('gasto')) {
    return `${intro} se a missao e reduzir gasto, eu iria direto em ${snapshot.topCategoryName}, que ta puxando ${Math.round(snapshot.topCategoryShare)}% das despesas do mes.\n\nPlano pratico: limite semanal nessa categoria + revisao antes de pagar.\nAcao recomendada: ${topAction}\n\n${closer}`;
  }

  if (q.includes('meta') || q.includes('planej') || q.includes('objetivo')) {
    const suggestedTarget = Math.max(0, snapshot.totalExpenses * 0.1);
    return `${intro} meta boa e meta que cabe na vida real.\n\nSugestao para 30 dias: reduzir ${formatCurrency(suggestedTarget)} em despesas variaveis, coisa de uns 10% do gasto atual.\n\nMeta simples: "economizar ${formatCurrency(suggestedTarget)} ate o fim do proximo mes". ${closer}`;
  }

  if (q.includes('categoria') || q.includes('onde') || q.includes('concentr')) {
    return `${intro} ${snapshot.topCategoryName} e hoje a principal categoria de despesas, com ${formatCurrency(snapshot.topCategoryAmount)}.\n\nSe quiser, eu monto um plano especifico so pra ela: meta semanal, teto e rotina de controle. ${closer}`;
  }

  if (q.includes('divida') || q.includes('cartao') || q.includes('parcel')) {
    return `${intro} divida se resolve por ordem e sangue frio, ${addressTerm}.\n\nMinha estrategia: atacar juros mais altos primeiro, congelar novas parcelas por 30 dias e separar um valor fixo semanal pra amortizacao. Se voce me disser o valor da divida, eu te desenho um plano redondo. ${closer}`;
  }

  return `${intro} analisei seus dados e meu conselho principal agora e: ${topAction}\n\nSe quiser, manda uma dessas: "meta de economia", "resumo do mes" ou "como cortar gastos da categoria ${snapshot.topCategoryName}". ${closer}`;
}

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(startOfCurrentMonth());
  const [transactionForm, setTransactionForm] = useState(buildEmptyTransactionForm());
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
  const [authReady, setAuthReady] = useState(!isSupabaseEnabled);
  const [currentHouseholdId, setCurrentHouseholdId] = useState(isSupabaseEnabled ? '' : seedState.householdId);
  const [currentUserName, setCurrentUserName] = useState('Voce');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [households, setHouseholds] = useState<HouseholdSummaryItem[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [members, setMembers] = useState<HouseholdMemberItem[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [memberPendingRemoval, setMemberPendingRemoval] = useState<HouseholdMemberItem | null>(null);
  const [advisorFocus, setAdvisorFocus] = useState('');
  const [advisorRecommendations, setAdvisorRecommendations] = useState<AdvisorRecommendation[]>([]);
  const [advisorQuestion, setAdvisorQuestion] = useState('');
  const [advisorThinking, setAdvisorThinking] = useState(false);
  const [advisorMessages, setAdvisorMessages] = useState<AdvisorChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: 'Eu sou o Rodrigao. Vamos dizer assim: se o assunto e organizar a grana da casa, aqui e no capricho. Mande sua pergunta sobre economia, metas, categorias, divida ou fluxo do mes.',
    },
  ]);
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string | null>(null);
  const advisorMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<DeferredInstallPromptEvent | null>(null);
  const [installPlatform, setInstallPlatform] = useState<'android' | 'ios' | 'other'>('other');
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installingApp, setInstallingApp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('casa-clara-install-banner-dismissed') === '1';
  });

  const activeHouseholdStorageKey = currentUserId ? `casa-clara-active-household-${currentUserId}` : '';

  useEffect(() => {
    if (!isSupabaseEnabled || !supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;

    const applyUser = (user: Awaited<ReturnType<typeof getCurrentUser>>) => {
      if (!mounted) return;
      if (!user) {
        setCurrentUserId('');
        setHouseholds([]);
        setCurrentHouseholdId('');
        setAppState(null);
        setLoadError(null);
        return;
      }

      const resolvedName =
        typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim().length > 0
          ? user.user_metadata.name
          : user.email?.split('@')[0] ?? 'Usuario';

      setCurrentUserName(resolvedName);
      setCurrentUserId(user.id);
      const savedHousehold = localStorage.getItem(`casa-clara-active-household-${user.id}`) ?? '';
      setCurrentHouseholdId(savedHousehold);
    };

    void getCurrentUser().then((user) => {
      applyUser(user);
      if (mounted) {
        setAuthReady(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (isSupabaseEnabled && !currentUserId) {
      return;
    }

    let mounted = true;

    const initialize = async () => {
      try {
        const [state, userHouseholds] = await Promise.all([
          loadState(currentHouseholdId),
          getUserHouseholds(),
        ]);
        if (!mounted) {
          return;
        }
        setHouseholds(userHouseholds);
        setAppState(state);
        setLoadError(null);
        try {
          const householdMembers = await listHouseholdMembers(state.householdId);
          if (!mounted) {
            return;
          }
          setMembers(householdMembers);
        } catch (error) {
          console.error('[listHouseholdMembers]', error);
          if (mounted) {
            setMembers([]);
          }
        }
        if (state.householdId !== currentHouseholdId) {
          setCurrentHouseholdId(state.householdId);
          if (activeHouseholdStorageKey) {
            localStorage.setItem(activeHouseholdStorageKey, state.householdId);
          }
        }
        setTransactionForm((current) => ({
          ...current,
          categoryId: state.categories.find((item) => item.kind === current.type)?.id ?? state.categories[0]?.id ?? '',
          paidBy: current.paidBy || currentUserName,
        }));
      } catch (error) {
        console.error('[initialize]', error);
        setLoadError(error instanceof Error ? error.message : 'Nao foi possivel carregar seus dados.');
      }
    };

    void initialize();
    const unsubscribe = subscribeToRealtime(currentHouseholdId, () => {
      setSyncStatus('online');
      void initialize();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [activeHouseholdStorageKey, authReady, currentHouseholdId, currentUserId, currentUserName]);
  const categories = appState?.categories ?? [];
  const transactions = appState?.transactions ?? [];
  const activeHousehold = households.find((item) => item.id === currentHouseholdId) ?? null;

  useEffect(() => {
    setGroupNameDraft(activeHousehold?.name ?? '');
  }, [activeHousehold?.name]);

  const availableUsers = useMemo(() => {
    const unique = new Set<string>();
    for (const member of members) {
      if (member.name.trim()) {
        unique.add(member.name.trim());
      }
    }
    for (const transaction of transactions) {
      if (transaction.paidBy.trim()) {
        unique.add(transaction.paidBy.trim());
      }
    }
    if (currentUserName.trim()) {
      unique.add(currentUserName.trim());
    }
    if (unique.size === 0) {
      unique.add('Voce');
    }
    return Array.from(unique);
  }, [members, transactions, currentUserName]);

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
      availableUsers.map((user) => ({
        name: user,
        total: monthTransactions
          .filter((item) => item.type === 'expense' && item.paidBy === user)
          .reduce((sum, item) => sum + item.amount, 0),
      })),
    [availableUsers, monthTransactions],
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
    () => buildInsights(transactions, categories, selectedMonth, availableUsers),
    [transactions, categories, selectedMonth, availableUsers],
  );

  const advisorSnapshot = useMemo(
    () => buildAdvisorSnapshot(transactions, categories, selectedMonth),
    [transactions, categories, selectedMonth],
  );
  const advisorAddressTerm = useMemo(() => inferAdvisorAddress(currentUserName), [currentUserName]);
  const isAdvisorBusy = advisorThinking || streamingAssistantMessageId !== null;
  const showInstallBanner = installAvailable && !isInstalled && !installBannerDismissed;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const getStandaloneState = () => {
      const standaloneByDisplayMode = window.matchMedia('(display-mode: standalone)').matches;
      const standaloneByNavigator = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      return standaloneByDisplayMode || standaloneByNavigator;
    };

    const syncInstallState = () => {
      const standalone = getStandaloneState();
      setIsInstalled(standalone);
      if (!standalone) {
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIos = /iphone|ipad|ipod/.test(userAgent);
        if (isIos) {
          setInstallPlatform('ios');
          setInstallAvailable(true);
        }
      }
    };

    const onBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as DeferredInstallPromptEvent;
      event.preventDefault();
      setInstallPromptEvent(promptEvent);
      setInstallPlatform('android');
      setInstallAvailable(true);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallAvailable(false);
      setInstallPromptEvent(null);
      localStorage.setItem('casa-clara-install-banner-dismissed', '1');
      setInstallBannerDismissed(true);
    };

    syncInstallState();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const container = advisorMessagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [advisorMessages, advisorThinking, streamingAssistantMessageId]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  function typeAssistantReply(replyText: string) {
    const assistantMessageId = crypto.randomUUID();
    setAdvisorMessages((current) => [...current, { id: assistantMessageId, role: 'assistant', text: '' }]);
    setStreamingAssistantMessageId(assistantMessageId);

    return new Promise<void>((resolve) => {
      let nextIndex = 0;

      const tick = () => {
        nextIndex += 1;
        const partialText = replyText.slice(0, nextIndex);
        setAdvisorMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, text: partialText } : message)),
        );

        if (nextIndex >= replyText.length) {
          setStreamingAssistantMessageId(null);
          typingTimerRef.current = null;
          resolve();
          return;
        }

        const currentChar = replyText.charAt(nextIndex - 1);
        const delay = /[,.!?]/.test(currentChar) ? 34 : 14;
        typingTimerRef.current = window.setTimeout(tick, delay);
      };

      typingTimerRef.current = window.setTimeout(tick, 90);
    });
  }

  useEffect(() => {
    setAdvisorRecommendations(
      buildFinancialAdvisorRecommendations(transactions, categories, selectedMonth, advisorFocus),
    );
  }, [transactions, categories, selectedMonth]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Preencha email e senha.');
      return;
    }

    if (authMode === 'signup' && authName.trim().length < 2) {
      setAuthError('Informe seu nome para criar a conta.');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (authMode === 'signup') {
        await signUpWithPassword(authEmail.trim(), authPassword, authName.trim());
        await signInWithPassword(authEmail.trim(), authPassword);
      } else {
        await signInWithPassword(authEmail.trim(), authPassword);
      }
      setAuthError(null);
    } catch (error) {
      console.error('[handleAuthSubmit]', error);
      setAuthError('Nao foi possivel autenticar. Verifique seus dados e tente novamente.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setAppState(null);
    setHouseholds([]);
    setCurrentUserId('');
    setCurrentHouseholdId('');
    setInviteCode('');
    setJoinCode('');
    setShareError(null);
  }

  async function refreshState() {
    const nextState = await loadState(currentHouseholdId);
    setAppState(nextState);
  }

  async function handleGenerateInvite() {
    if (!currentHouseholdId) return;

    setShareBusy(true);
    setShareError(null);
    try {
      const code = await createHouseholdInvite(currentHouseholdId);
      setInviteCode(code);
    } catch (error) {
      console.error('[handleGenerateInvite]', error);
      setShareError('Nao foi possivel gerar o codigo de convite.');
    } finally {
      setShareBusy(false);
    }
  }

  async function handleJoinByCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinCode.trim()) {
      setShareError('Informe um codigo de convite.');
      return;
    }

    setShareBusy(true);
    setShareError(null);
    try {
      const joinedHouseholdId = await joinHouseholdByInviteCode(joinCode);
      if (activeHouseholdStorageKey) {
        localStorage.setItem(activeHouseholdStorageKey, joinedHouseholdId);
      }
      setCurrentHouseholdId(joinedHouseholdId);
      setJoinCode('');
      const [userHouseholds, householdMembers] = await Promise.all([
        getUserHouseholds(),
        listHouseholdMembers(joinedHouseholdId),
      ]);
      setHouseholds(userHouseholds);
      setMembers(householdMembers);
    } catch (error) {
      console.error('[handleJoinByCode]', error);
      setShareError('Codigo invalido ou expirado.');
    } finally {
      setShareBusy(false);
    }
  }

  async function handleRenameGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentHouseholdId || !groupNameDraft.trim()) {
      return;
    }

    setGroupBusy(true);
    setGroupError(null);
    try {
      await renameHousehold(currentHouseholdId, groupNameDraft.trim());
      const userHouseholds = await getUserHouseholds();
      setHouseholds(userHouseholds);
    } catch (error) {
      console.error('[handleRenameGroup]', error);
      setGroupError('Nao foi possivel renomear o grupo.');
    } finally {
      setGroupBusy(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!currentHouseholdId) return;

    setGroupBusy(true);
    setGroupError(null);
    try {
      await removeMemberFromHousehold(currentHouseholdId, userId);
      const householdMembers = await listHouseholdMembers(currentHouseholdId);
      setMembers(householdMembers);
      setMemberPendingRemoval(null);
    } catch (error) {
      console.error('[handleRemoveMember]', error);
      setGroupError('Nao foi possivel remover o convidado.');
    } finally {
      setGroupBusy(false);
    }
  }

  function handleRequestRemoveMember(member: HouseholdMemberItem) {
    setMemberPendingRemoval(member);
  }

  function handleGenerateAdvisorPlan() {
    setAdvisorRecommendations(
      buildFinancialAdvisorRecommendations(transactions, categories, selectedMonth, advisorFocus),
    );
  }

  async function requestAdvisorReply(question: string) {
    const recommendations = buildFinancialAdvisorRecommendations(transactions, categories, selectedMonth, advisorFocus);
    const recentTransactions = [...transactions]
      .filter((item) => toMonthKey(item.transactionDate) === selectedMonth)
      .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))
      .slice(0, 12)
      .map((item) => ({
        description: item.description,
        amount: item.amount,
        type: item.type,
        categoryName: categories.find((category) => category.id === item.categoryId)?.name ?? 'Sem categoria',
        paidBy: item.paidBy,
        transactionDate: item.transactionDate,
      }));

    if (!isSupabaseEnabled || !supabase) {
      return buildAdvisorReply(question, advisorSnapshot, recommendations, advisorAddressTerm);
    }

    try {
      const result = await invokeFinancialAdvisor({
        householdName: activeHousehold?.name ?? 'Grupo financeiro',
        selectedMonth,
        focus: advisorFocus,
        preferredAddress: advisorAddressTerm,
        snapshot: advisorSnapshot,
        recommendations,
        recentTransactions,
        messages: advisorMessages.slice(-8).map((message) => ({
          role: message.role,
          text: message.text,
        })),
      });
      return result.reply;
    } catch (error) {
      console.error('[requestAdvisorReply]', error);
      return buildAdvisorReply(question, advisorSnapshot, recommendations, advisorAddressTerm);
    }
  }

  async function handleAdvisorChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = advisorQuestion.trim();
    if (!question || isAdvisorBusy) return;

    const userMessage: AdvisorChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: question,
    };

    setAdvisorMessages((current) => [...current, userMessage]);
    setAdvisorQuestion('');
    setAdvisorThinking(true);

    try {
      const replyText = await requestAdvisorReply(question);
      setAdvisorThinking(false);
      await typeAssistantReply(replyText);
    } finally {
      setAdvisorThinking(false);
    }
  }

  function handleAdvisorQuickPrompt(prompt: string) {
    setAdvisorQuestion(prompt);
  }

  async function handleInstallApp() {
    if (!installPromptEvent || installPlatform !== 'android') {
      return;
    }

    setInstallingApp(true);
    try {
      await installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('casa-clara-install-banner-dismissed', '1');
        setInstallBannerDismissed(true);
      }
    } finally {
      setInstallingApp(false);
      setInstallPromptEvent(null);
    }
  }

  function handleDismissInstallBanner() {
    localStorage.setItem('casa-clara-install-banner-dismissed', '1');
    setInstallBannerDismissed(true);
  }

  const mobileMenuItems: Array<{ id: MobileView; label: string; description: string }> = [
    { id: 'dashboard', label: 'Dashboard geral', description: 'Resumo, previsoes e insights' },
    { id: 'lancamentos', label: 'Lancamentos', description: 'Novo movimento, historico e categorias' },
    { id: 'analises', label: 'Analises', description: 'Graficos de categorias, evolucao e quem pagou' },
    { id: 'planejamento', label: 'Planejador IA', description: 'Recomendacoes e chat inteligente' },
    { id: 'grupo', label: 'Grupo e convites', description: 'Membros, codigo e compartilhamento' },
  ];

  function handleDashboardShortcut(targetView: MobileView) {
    setMobileView(targetView);
    if (window.matchMedia('(max-width: 780px)').matches) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleDashboardShortcutKeyDown(event: React.KeyboardEvent<HTMLElement>, targetView: MobileView) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    handleDashboardShortcut(targetView);
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
        ...buildEmptyTransactionForm(currentUserName),
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
        ...buildEmptyTransactionForm(currentUserName),
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

  if (!authReady) {
    return <div className="loading-screen">Validando acesso...</div>;
  }

  if (isSupabaseEnabled && !currentHouseholdId) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <span className="eyebrow">Acesso seguro</span>
          <h1>Entre para acessar seus dados</h1>
          <p>Cada conta enxerga apenas os proprios lancamentos e categorias.</p>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <label>
                Nome
                <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Seu nome" />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="voce@email.com"
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="Sua senha"
              />
            </label>

            <button className="primary-button" type="submit" disabled={authSubmitting}>
              {authSubmitting
                ? 'Entrando...'
                : authMode === 'signup'
                ? 'Criar conta e entrar'
                : 'Entrar'}
            </button>

            {authError && <p className="form-error">{authError}</p>}
          </form>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setAuthError(null);
              setAuthMode((current) => (current === 'signin' ? 'signup' : 'signin'));
            }}
          >
            {authMode === 'signin' ? 'Primeiro acesso? Criar conta' : 'Ja tenho conta'}
          </button>
        </div>
      </div>
    );
  }

  if (loadError && !appState) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <span className="eyebrow">Erro de carregamento</span>
          <h1>Falha ao abrir o painel</h1>
          <p>{loadError}</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!appState) {
    return <div className="loading-screen">Carregando painel financeiro...</div>;
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <button
        type="button"
        className="mobile-menu-trigger"
        onClick={() => setMobileMenuOpen(true)}
        aria-label="Abrir menu de secoes"
      >
        <Menu size={18} />
        <span>Menu</span>
      </button>

      {mobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
          <aside className="mobile-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div>
                <small>Navegacao</small>
                <strong>Casa Clara</strong>
              </div>
              <button type="button" className="mobile-drawer-close" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu">
                <X size={16} />
              </button>
            </div>
            <nav className="mobile-drawer-nav" aria-label="Secoes do app">
              {mobileMenuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`mobile-nav-item ${mobileView === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setMobileView(item.id);
                    setMobileMenuOpen(false);
                  }}
                >
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <header className="hero">
        <div>
          <span className="eyebrow">Financeiro colaborativo com convite</span>
          <h1>Casa Clara</h1>
          <p>
            Registre gastos em segundos, acompanhe o mes com clareza e compartilhe o mesmo painel com quem voce
            convidar.
          </p>
        </div>

        <div className="hero-actions">
          <div className="sync-pill">
            {syncStatus === 'online' ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{syncStatus === 'online' ? 'Finanças Conectadas' : 'Modo local ativo'}</span>
          </div>

          {showInstallBanner && (
            <section className="install-card" aria-live="polite">
              <div className="install-card-head">
                <strong>Instale o app no celular</strong>
                <button type="button" className="install-dismiss" onClick={handleDismissInstallBanner} aria-label="Fechar aviso">
                  <X size={14} />
                </button>
              </div>
              {installPlatform === 'android' ? (
                <>
                  <p>Adicione a Casa Clara na tela inicial para abrir como app, com visual nativo.</p>
                  <button
                    type="button"
                    className="primary-button install-cta"
                    onClick={() => void handleInstallApp()}
                    disabled={installingApp}
                  >
                    {installingApp ? 'Abrindo instalacao...' : 'Instalar app'}
                  </button>
                </>
              ) : (
                <p>
                  No iPhone/iPad: abra no Safari, toque em Compartilhar e escolha Adicionar a Tela de Inicio.
                </p>
              )}
            </section>
          )}

          {isSupabaseEnabled && (
            <button type="button" className="secondary-button logout-button" onClick={() => void handleSignOut()}>
              Sair da conta
            </button>
          )}

          <div className="month-selector">
            <label htmlFor="household-select">Grupo ativo</label>
            <select
              id="household-select"
              value={currentHouseholdId}
              onChange={(event) => {
                const nextHouseholdId = event.target.value;
                if (activeHouseholdStorageKey) {
                  localStorage.setItem(activeHouseholdStorageKey, nextHouseholdId);
                }
                setCurrentHouseholdId(nextHouseholdId);
              }}
            >
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.name} ({household.role === 'owner' ? 'dono' : 'membro'})
                </option>
              ))}
            </select>
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

      <main className={`dashboard-grid mobile-view-${mobileView}`}>
        <section className="panel panel-highlight mobile-view-panel mobile-view-dashboard">
          <div className="section-heading">
            <div>
              <span className="section-label">Resumo mensal</span>
              <h2>Visao rapida do mes</h2>
            </div>
          </div>

          <div className="summary-grid">
            <article
              className="summary-card tone-expense dashboard-shortcut"
              role="button"
              tabIndex={0}
              onClick={() => handleDashboardShortcut('lancamentos')}
              onKeyDown={(event) => handleDashboardShortcutKeyDown(event, 'lancamentos')}
              title="Abrir lancamentos"
            >
              <span>Gastos</span>
              <strong>{formatCurrency(monthlySummary.totalExpenses)}</strong>
              <small>{monthlySummary.previousMonthDelta >= 0 ? 'Acima' : 'Abaixo'} do mes anterior</small>
            </article>

            <article
              className="summary-card tone-income dashboard-shortcut"
              role="button"
              tabIndex={0}
              onClick={() => handleDashboardShortcut('lancamentos')}
              onKeyDown={(event) => handleDashboardShortcutKeyDown(event, 'lancamentos')}
              title="Abrir lancamentos"
            >
              <span>Entradas</span>
              <strong>{formatCurrency(monthlySummary.totalIncome)}</strong>
              <small>Receita registrada no mes</small>
            </article>

            <article
              className="summary-card tone-balance dashboard-shortcut"
              role="button"
              tabIndex={0}
              onClick={() => handleDashboardShortcut('lancamentos')}
              onKeyDown={(event) => handleDashboardShortcutKeyDown(event, 'lancamentos')}
              title="Abrir lancamentos"
            >
              <span>Saldo</span>
              <strong>{formatCurrency(monthlySummary.balance)}</strong>
              <small>Receitas menos despesas</small>
            </article>

            <article
              className="summary-card tone-focus dashboard-shortcut"
              role="button"
              tabIndex={0}
              onClick={() => handleDashboardShortcut('analises')}
              onKeyDown={(event) => handleDashboardShortcutKeyDown(event, 'analises')}
              title="Abrir analises"
            >
              <span>Categoria em destaque</span>
              <strong>{monthlySummary.topCategoryName}</strong>
              <small>{formatCurrency(monthlySummary.topCategoryAmount)}</small>
            </article>
          </div>

          <div className="insight-strip">
            <div
              className="dashboard-shortcut"
              role="button"
              tabIndex={0}
              onClick={() => handleDashboardShortcut('analises')}
              onKeyDown={(event) => handleDashboardShortcutKeyDown(event, 'analises')}
              title="Abrir analises"
            >
              <span>Media diaria</span>
              <strong>{formatCurrency(monthlySummary.averageDailyExpense)}</strong>
            </div>
            <div
              className="dashboard-shortcut"
              role="button"
              tabIndex={0}
              onClick={() => handleDashboardShortcut('analises')}
              onKeyDown={(event) => handleDashboardShortcutKeyDown(event, 'analises')}
              title="Abrir analises"
            >
              <span>Comparacao</span>
              <strong>{formatCurrency(Math.abs(monthlySummary.previousMonthDelta))}</strong>
            </div>
            <div
              className="dashboard-shortcut"
              role="button"
              tabIndex={0}
              onClick={() => handleDashboardShortcut('planejamento')}
              onKeyDown={(event) => handleDashboardShortcutKeyDown(event, 'planejamento')}
              title="Abrir planejador IA"
            >
              <span>Leitura automatica</span>
              <strong>
                {monthlySummary.topCategoryName === 'Sem destaque'
                  ? 'Adicione mais gastos para gerar insights'
                  : `${monthlySummary.topCategoryName} lidera o mes`}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel form-panel mobile-view-panel mobile-view-lancamentos">
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
                  {availableUsers.map((user) => (
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

        <section className="panel share-panel mobile-view-panel mobile-view-grupo">
          <div className="section-heading">
            <div>
              <span className="section-label">Compartilhamento</span>
              <h2>Convide outra pessoa</h2>
            </div>
            <Users size={18} />
          </div>

          <p className="empty-state">
            Grupo atual: <strong>{activeHousehold?.name ?? 'Sem grupo'}</strong>
          </p>

          <form className="join-form" onSubmit={handleRenameGroup}>
            <label>
              Nome do grupo
              <input
                value={groupNameDraft}
                onChange={(event) => setGroupNameDraft(event.target.value)}
                placeholder="Ex.: Casa da Karina e Rafael"
              />
            </label>
            <button className="secondary-button" type="submit" disabled={groupBusy || activeHousehold?.role !== 'owner'}>
              {groupBusy ? 'Salvando...' : activeHousehold?.role === 'owner' ? 'Renomear grupo' : 'Apenas o dono pode editar'}
            </button>
          </form>

          <button
            type="button"
            className="secondary-button"
            disabled={shareBusy || activeHousehold?.role !== 'owner'}
            onClick={() => void handleGenerateInvite()}
          >
            {shareBusy ? 'Gerando...' : activeHousehold?.role === 'owner' ? 'Gerar codigo de convite' : 'Apenas o dono gera convite'}
          </button>

          {inviteCode && (
            <div className="invite-code-box">
              <span>Codigo valido por 7 dias</span>
              <strong>{inviteCode}</strong>
            </div>
          )}

          <form className="join-form" onSubmit={handleJoinByCode}>
            <label>
              Entrar com codigo
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Ex.: AB12CD34"
              />
            </label>
            <button className="primary-button" type="submit" disabled={shareBusy}>
              {shareBusy ? 'Entrando...' : 'Entrar no grupo'}
            </button>
          </form>

          <div className="member-list">
            <span className="member-list-title">Membros do grupo</span>
            {members.length ? (
              members.map((member) => (
                <div key={member.userId} className="member-item">
                  <div>
                    <strong>{member.name}</strong>
                    <small>{member.role === 'owner' ? 'Dono' : 'Convidado'}</small>
                  </div>
                  {activeHousehold?.role === 'owner' && member.role === 'member' && (
                    <button
                      type="button"
                      className="chip-action-btn danger"
                      disabled={groupBusy}
                      onClick={() => handleRequestRemoveMember(member)}
                      aria-label="Remover convidado"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="empty-state">Nenhum membro encontrado.</p>
            )}
          </div>

          {(shareError || groupError) && <p className="form-error">{shareError ?? groupError}</p>}
        </section>

        <section className="panel advisor-panel mobile-view-panel mobile-view-planejamento">
          <div className="section-heading">
            <div>
              <span className="section-label">Assistente IA</span>
              <h2>Planejador financeiro da casa</h2>
            </div>
            <Brain size={18} />
          </div>

          <p className="empty-state">
            Analise profissional baseada nas movimentacoes do periodo selecionado, com foco em eficiencia e organizacao.
          </p>

          <div className="join-form">
            <label>
              Foco do momento (opcional)
              <input
                value={advisorFocus}
                onChange={(event) => setAdvisorFocus(event.target.value)}
                placeholder="Ex.: reduzir supermercado, montar reserva, quitar cartao"
              />
            </label>
            <button className="secondary-button" type="button" onClick={handleGenerateAdvisorPlan}>
              Gerar plano de melhoria
            </button>
          </div>

          <div className="advisor-list">
            {advisorRecommendations.map((item, index) => (
              <article key={`${item.title}-${index}`} className={`advisor-card priority-${item.priority}`}>
                <span className="advisor-priority">Prioridade {item.priority}</span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <small>Acao recomendada: {item.action}</small>
              </article>
            ))}
          </div>

          <div className="advisor-chat">
            <div className="advisor-chat-header">
              <MessageCircle size={16} />
              <span>Converse com o planejador financeiro</span>
            </div>

            <div className="advisor-quick-prompts">
              <button type="button" className="quick-prompt" onClick={() => handleAdvisorQuickPrompt('Me de um resumo do mes')}>
                Resumo do mes
              </button>
              <button type="button" className="quick-prompt" onClick={() => handleAdvisorQuickPrompt('Como reduzir gastos rapidamente?')}>
                Reduzir gastos
              </button>
              <button type="button" className="quick-prompt" onClick={() => handleAdvisorQuickPrompt('Defina uma meta para os proximos 30 dias')}>
                Meta de 30 dias
              </button>
            </div>

            <div className="advisor-messages" ref={advisorMessagesContainerRef}>
              {advisorMessages.map((message) => (
                <article key={message.id} className={`advisor-message ${message.role === 'assistant' ? 'assistant' : 'user'}`}>
                  <p>
                    {message.text}
                    {message.role === 'assistant' && streamingAssistantMessageId === message.id ? (
                      <span className="typing-cursor" aria-hidden="true">|</span>
                    ) : null}
                  </p>
                </article>
              ))}
              {advisorThinking && (
                <article className="advisor-message assistant">
                  <p>Um instante, {advisorAddressTerm}... estou cruzando os dados e montando a resposta.</p>
                </article>
              )}
            </div>

            <form className="advisor-chat-form" onSubmit={handleAdvisorChatSubmit}>
              <input
                value={advisorQuestion}
                onChange={(event) => setAdvisorQuestion(event.target.value)}
                disabled={isAdvisorBusy}
                placeholder="Pergunte sobre metas, economia, fluxo de caixa, categorias..."
              />
              <button type="submit" className="primary-button" disabled={isAdvisorBusy} aria-label="Enviar pergunta ao assistente">
                <SendHorizontal size={16} />
              </button>
            </form>
          </div>
        </section>

        <section className="panel chart-panel mobile-view-panel mobile-view-analises">
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

        <section className="panel chart-panel mobile-view-panel mobile-view-analises">
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

        <section className="panel chart-panel mobile-view-panel mobile-view-analises">
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

        <section className="panel history-panel mobile-view-panel mobile-view-lancamentos">
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

        <section className="panel category-panel mobile-view-panel mobile-view-lancamentos">
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

        <section className="panel predictions-panel mobile-view-panel mobile-view-dashboard">
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

        <section className="panel insights-panel mobile-view-panel mobile-view-dashboard">
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

      {memberPendingRemoval && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar remocao de convidado">
          <div className="confirm-modal">
            <h3>Remover convidado do grupo?</h3>
            <p>
              {memberPendingRemoval.name} sera removido deste grupo e deixara de visualizar as movimentacoes compartilhadas.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setMemberPendingRemoval(null)}
                disabled={groupBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button danger-button"
                onClick={() => void handleRemoveMember(memberPendingRemoval.userId)}
                disabled={groupBusy}
              >
                {groupBusy ? 'Removendo...' : 'Confirmar remocao'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
