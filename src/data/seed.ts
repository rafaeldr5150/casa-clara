import type { AppState } from '../lib/types';

const householdId = '11111111-1111-1111-1111-111111111111';
const now = new Date().toISOString();
const currentMonth = new Date().toISOString().slice(0, 7);
const previousMonthDate = new Date();
previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
const previousMonth = previousMonthDate.toISOString().slice(0, 7);

export const seedState: AppState = {
  householdId,
  categories: [
    { id: 'cat-home', householdId, name: 'Moradia', color: '#355c7d', icon: 'Home', kind: 'expense', isDefault: true },
    { id: 'cat-market', householdId, name: 'Supermercado', color: '#c06c84', icon: 'ShoppingBasket', kind: 'expense', isDefault: true },
    { id: 'cat-transport', householdId, name: 'Transporte', color: '#6c5b7b', icon: 'Car', kind: 'expense', isDefault: true },
    { id: 'cat-leisure', householdId, name: 'Lazer', color: '#f67280', icon: 'Ticket', kind: 'expense', isDefault: true },
    { id: 'cat-health', householdId, name: 'Saude', color: '#2a9d8f', icon: 'HeartPulse', kind: 'expense', isDefault: true },
    { id: 'cat-salary', householdId, name: 'Receitas', color: '#2f855a', icon: 'Wallet', kind: 'income', isDefault: true },
    { id: 'cat-bills', householdId, name: 'Contas da Casa', color: '#f4a261', icon: 'ReceiptText', kind: 'expense', isDefault: true }
  ],
  transactions: [
    {
      id: 'txn-1',
      householdId,
      description: 'Mercado semanal',
      amount: 328.7,
      type: 'expense',
      categoryId: 'cat-market',
      paidBy: 'Rafael',
      transactionDate: `${currentMonth}-03`,
      notes: 'Compra grande do mes',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'txn-2',
      householdId,
      description: 'Conta de energia',
      amount: 214.45,
      type: 'expense',
      categoryId: 'cat-bills',
      paidBy: 'Karina',
      transactionDate: `${currentMonth}-05`,
      notes: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'txn-3',
      householdId,
      description: 'Jantar de sexta',
      amount: 142.9,
      type: 'expense',
      categoryId: 'cat-leisure',
      paidBy: 'Rafael',
      transactionDate: `${currentMonth}-09`,
      notes: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'txn-4',
      householdId,
      description: 'Farmacia',
      amount: 88.2,
      type: 'expense',
      categoryId: 'cat-health',
      paidBy: 'Karina',
      transactionDate: `${currentMonth}-11`,
      notes: 'Vitaminas',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'txn-5',
      householdId,
      description: 'Salario Rafael',
      amount: 7200,
      type: 'income',
      categoryId: 'cat-salary',
      paidBy: 'Rafael',
      transactionDate: `${currentMonth}-01`,
      notes: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'txn-6',
      householdId,
      description: 'Mercado do mes anterior',
      amount: 281.5,
      type: 'expense',
      categoryId: 'cat-market',
      paidBy: 'Karina',
      transactionDate: `${previousMonth}-12`,
      notes: '',
      createdAt: now,
      updatedAt: now,
    }
  ],
};