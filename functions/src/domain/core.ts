// أساسيات مشتركة: الأخطاء، التقريب، العملات، أسماء الكوليكشنز

export class AppError extends Error {
  constructor(public code: 'invalid' | 'not-found' | 'denied' | 'conflict', message: string) {
    super(message)
  }
}

export const fail = (message: string): never => {
  throw new AppError('invalid', message)
}

export const notFound = (message: string): never => {
  throw new AppError('not-found', message)
}

export const COL = {
  products: 'products',
  categories: 'categories',
  sales: 'sales',
  purchases: 'purchases',
  expenses: 'expenses',
  customers: 'customers',
  suppliers: 'suppliers',
  accounts: 'accounts',
  journal: 'journalEntries',
  partners: 'partners',
  partnerTx: 'partnerTransactions',
  customerPayments: 'customerPayments',
  supplierPayments: 'supplierPayments',
  inventoryLogs: 'inventoryLogs',
  settings: 'settings',
  counters: 'luxe_counters',
  members: 'luxe_members',
  meta: 'luxe_meta',
} as const

export interface Ctx {
  uid: string
  email?: string
  role: 'owner' | 'staff'
  origin: 'ui' | 'assistant' | 'system'
  now: Date
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export const sum = (values: number[]) => round2(values.reduce((a, b) => a + (Number(b) || 0), 0))

export type Currency = 'ILS' | 'USD' | 'JOD'

export const CURRENCY_LABEL: Record<Currency, string> = {
  ILS: 'شيكل',
  USD: 'دولار',
  JOD: 'دينار',
}

export interface Rates {
  USD: number
  JOD: number
}

export const DEFAULT_RATES: Rates = { USD: 3.7, JOD: 5.2 }

// تحويل أي مبلغ للشيكل (العملة الأساسية للدفاتر)
export function toBase(amount: number, currency: Currency, rate?: number, rates: Rates = DEFAULT_RATES) {
  if (currency === 'ILS') return { base: round2(amount), rate: 1 }
  const r = rate && rate > 0 ? rate : rates[currency]
  if (!r || r <= 0) fail(`سعر صرف ${CURRENCY_LABEL[currency]} غير محدد في الإعدادات`)
  return { base: round2(amount * r), rate: r }
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD'

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  CREDIT_CARD: 'بطاقة',
}

export const ITEM_TYPE_LABEL: Record<string, string> = {
  SILVER: 'فضة',
  STEEL: 'ستانليس',
  OTHER: 'أخرى',
}

export const iso = (d: Date) => d.toISOString()

export const isCancelled = (doc: Record<string, any>) => doc.status === 'CANCELLED'

export function cleanText(v: unknown, max = 500) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
