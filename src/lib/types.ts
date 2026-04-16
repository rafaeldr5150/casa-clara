export type EntryType = 'expense' | 'income';

export type HouseholdUser = string;

export interface Category {
  id: string;
  householdId: string;
  name: string;
  color: string;
  icon: string;
  kind: EntryType;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  householdId: string;
  description: string;
  amount: number;
  type: EntryType;
  categoryId: string;
  paidBy: HouseholdUser;
  transactionDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlySummary {
  totalExpenses: number;
  totalIncome: number;
  balance: number;
  averageDailyExpense: number;
  topCategoryName: string;
  topCategoryAmount: number;
  previousMonthDelta: number;
}

export interface AppState {
  householdId: string;
  categories: Category[];
  transactions: Transaction[];
}

export interface HouseholdSummaryItem {
  id: string;
  name: string;
  role: 'owner' | 'member';
}

export interface HouseholdMemberItem {
  userId: string;
  name: string;
  role: 'owner' | 'member';
}