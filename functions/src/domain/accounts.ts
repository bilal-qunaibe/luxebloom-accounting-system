import { COL, iso, type PaymentMethod } from './core.js'
import type { Store } from '../store.js'

// شجرة الحسابات الأساسية للنظام
// كل حساب إله id ثابت، عشان القيود التلقائية تعرف وين تروح بدون ما تدور

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export interface AccountDef {
  id: string
  code: string
  name: string
  type: AccountType
}

export const ACC = {
  cash: 'sys_cash',
  bank: 'sys_bank',
  receivable: 'sys_ar',
  inventory: 'sys_inventory',
  payable: 'sys_ap',
  opening: 'sys_opening',
  revenue: 'sys_revenue',
  cogs: 'sys_cogs',
  inventoryAdjust: 'sys_inv_adjust',
} as const

export const EXPENSE_CATEGORIES = [
  'رواتب وأجور',
  'فواتير (كهرباء، ماء، إنترنت)',
  'إيجار المحل',
  'صيانة وتصليحات',
  'ضيافة ونثريات',
  'تسويق وإعلانات',
  'شحن وتوصيل',
  'مشتريات ومستلزمات',
  'مصاريف أخرى',
] as const

export const expenseAccountId = (category: string) => {
  const idx = EXPENSE_CATEGORIES.indexOf(category as any)
  return `sys_exp_${idx === -1 ? EXPENSE_CATEGORIES.length : idx + 1}`
}

export const normalizeExpenseCategory = (category?: string) => {
  const c = (category || '').trim()
  return (EXPENSE_CATEGORIES as readonly string[]).includes(c) ? c : 'مصاريف أخرى'
}

export const SYSTEM_ACCOUNTS: AccountDef[] = [
  { id: ACC.cash, code: '1101', name: 'الصندوق (نقدي)', type: 'ASSET' },
  { id: ACC.bank, code: '1102', name: 'البنك', type: 'ASSET' },
  { id: ACC.receivable, code: '1201', name: 'ذمم العملاء', type: 'ASSET' },
  { id: ACC.inventory, code: '1301', name: 'المخزون', type: 'ASSET' },
  { id: ACC.payable, code: '2101', name: 'ذمم الموردين', type: 'LIABILITY' },
  { id: ACC.opening, code: '3101', name: 'أرصدة افتتاحية', type: 'EQUITY' },
  { id: ACC.revenue, code: '4101', name: 'إيرادات المبيعات', type: 'REVENUE' },
  { id: ACC.cogs, code: '5001', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE' },
  { id: ACC.inventoryAdjust, code: '5002', name: 'فروقات جرد المخزون', type: 'EXPENSE' },
  ...EXPENSE_CATEGORIES.map((name, i) => ({
    id: `sys_exp_${i + 1}`,
    code: String(5101 + i),
    name,
    type: 'EXPENSE' as const,
  })),
]

export const partnerAccountId = (partnerId: string) => `sys_partner_${partnerId}`

export const moneyAccount = (method: PaymentMethod) => (method === 'CASH' ? ACC.cash : ACC.bank)

const CHART_VERSION = 2
let chartReady = false

// إنشاء الحسابات الناقصة مرة وحدة (آمنة لو انطلبت أكثر من مرة بنفس الوقت)
export async function ensureSystemAccounts(store: Store, now = new Date()) {
  if (chartReady) return
  const meta = await store.get(COL.meta, 'chart')
  if (meta.exists && meta.data.version >= CHART_VERSION) {
    chartReady = true
    return
  }
  for (const acc of SYSTEM_ACCOUNTS) {
    await store.createIfMissing(COL.accounts, acc.id, {
      code: acc.code,
      name: acc.name,
      type: acc.type,
      openingBalance: 0,
      isSystem: true,
      createdAt: iso(now),
    })
  }
  await store.batchWrite([{ col: COL.meta, id: 'chart', data: { version: CHART_VERSION, updatedAt: iso(now) }, merge: true }])
  chartReady = true
}

// للاختبارات فقط
export const resetChartCache = () => {
  chartReady = false
}
