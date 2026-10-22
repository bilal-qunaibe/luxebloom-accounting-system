import { ACC } from './accounts.js'
import { COL, isCancelled, round2 } from './core.js'
import { stockState } from './inventory.js'
import type { Store } from '../store.js'

// استعلامات للقراءة فقط (بيستخدمها المساعد)

// توحيد الكتابة العربية عشان البحث يلقط "اسواره" و"أسوارة"
export function normalizeAr(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

// جذر تقريبي للكلمة: "فضي" و"فضة" و"الفضة" كلهم "فض"
function stem(word: string) {
  let w = word.replace(/^(وال|بال|لل|ال)/, '')
  w = w.replace(/(ات|ين|ون|يه|ه|ي)$/, '')
  return w.length >= 2 ? w : word
}

// درجة التطابق = عدد كلمات البحث اللي لقيناها
function score(haystack: string[], query: string) {
  const words = normalizeAr(query).split(' ').filter(Boolean).map(stem)
  if (!words.length) return 1
  const tokens = normalizeAr(haystack.filter(Boolean).join(' ')).split(' ').map(stem)
  return words.filter(w => tokens.some(t => t.includes(w) || (w.length >= 3 && t.length >= 3 && w.includes(t)))).length
}

function rank<T extends { data: any }>(rows: T[], query: string, fields: (d: any) => string[]) {
  return rows
    .map(r => ({ r, s: score(fields(r.data), query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.r)
}

const TYPE_WORDS: Record<string, string> = { SILVER: 'فضة silver', STEEL: 'ستانليس ستيل steel', OTHER: '' }

export async function searchProducts(store: Store, query: string, limit = 12) {
  const all = await store.list(COL.products)
  return rank(all, query, d => [d.name, d.nameEn, d.code, TYPE_WORDS[d.itemType] || ''])
    .slice(0, limit)
    .map(p => {
      const s = stockState(p.id, p.data)
      return {
        id: p.id,
        code: p.data.code || '',
        name: s.name,
        type: p.data.itemType || 'OTHER',
        quantity: s.quantity,
        sizes: s.variants.map(v => `${v.size}: ${v.quantity}`),
        salePrice: Number(p.data.salePrice) || 0,
        cost: s.purchasePrice,
        active: p.data.isActive !== false,
      }
    })
}

export async function findParties(store: Store, kind: 'customers' | 'suppliers' | 'partners', query: string, limit = 10) {
  const all = await store.list(COL[kind])
  return rank(all, query, d => [d.name, d.phone, d.company])
    .slice(0, limit)
    .map(p => ({
      id: p.id,
      name: p.data.name || '',
      phone: p.data.phone || '',
      ...(kind === 'partners' ? { sharePercent: Number(p.data.sharePercent) || 0 } : { debt: round2(Number(p.data.debt) || 0) }),
    }))
}

const hebronDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all'

export function periodRange(period: Period, now: Date) {
  const today = hebronDay(now)
  const shift = (days: number) => hebronDay(new Date(now.getTime() - days * 86_400_000))
  switch (period) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: shift(1), to: shift(1) }
    case 'week':
      return { from: shift(6), to: today }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
    default:
      return { from: '0000-01-01', to: '9999-12-31' }
  }
}

export async function report(store: Store, period: Period, now = new Date()) {
  const { from, to } = periodRange(period, now)
  const inRange = (createdAt: unknown) => {
    if (!createdAt) return false
    const day = hebronDay(new Date(String(createdAt)))
    return day >= from && day <= to
  }
  const [sales, purchases, expenses, products, customers, suppliers, entries] = await Promise.all([
    store.list(COL.sales),
    store.list(COL.purchases),
    store.list(COL.expenses),
    store.list(COL.products),
    store.list(COL.customers),
    store.list(COL.suppliers),
    store.list(COL.journal),
  ])

  const live = <T extends { data: any }>(rows: T[]) => rows.filter(r => !isCancelled(r.data) && inRange(r.data.createdAt))
  const s = live(sales)
  const revenue = round2(s.reduce((a, r) => a + (Number(r.data.totalRevenue) || 0), 0))
  const cost = round2(s.reduce((a, r) => a + (Number(r.data.totalCost) || 0), 0))
  const exp = round2(live(expenses).reduce((a, r) => a + (Number(r.data.amount) || 0), 0))
  const pur = round2(live(purchases).reduce((a, r) => a + (Number(r.data.totalCost) || 0), 0))

  const byProduct = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const r of s) {
    for (const i of r.data.items || []) {
      const cur = byProduct.get(i.productId) || { name: i.name, qty: 0, revenue: 0 }
      cur.qty += Number(i.quantity) || 0
      cur.revenue = round2(cur.revenue + (Number(i.total) || 0))
      byProduct.set(i.productId, cur)
    }
  }

  const balance = (accountId: string, debitNormal = true) =>
    round2(
      entries.reduce((bal, e) => {
        for (const i of e.data.items || []) {
          if (i.debitAccountId === accountId) bal += debitNormal ? Number(i.debit) || 0 : -(Number(i.debit) || 0)
          if (i.creditAccountId === accountId) bal += debitNormal ? -(Number(i.credit) || 0) : Number(i.credit) || 0
        }
        return bal
      }, 0),
    )

  return {
    period: { name: period, from, to },
    sales: { invoices: s.length, revenue, cost, grossProfit: round2(revenue - cost) },
    expenses: exp,
    purchases: pur,
    netProfit: round2(revenue - cost - exp),
    topProducts: [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
    lowStock: products
      .map(p => stockState(p.id, p.data))
      .filter(p => p.data.isActive !== false && p.quantity <= (Number(p.data.minQuantity) || 0))
      .slice(0, 15)
      .map(p => ({ name: p.name, quantity: p.quantity })),
    customersOwe: round2(customers.reduce((a, c) => a + (Number(c.data.debt) || 0), 0)),
    weOweSuppliers: round2(suppliers.reduce((a, c) => a + (Number(c.data.debt) || 0), 0)),
    cashBalance: balance(ACC.cash),
    bankBalance: balance(ACC.bank),
  }
}

export async function recentOperations(store: Store, limit = 10) {
  const cols = [
    { col: COL.sales, kind: 'sale', label: 'بيع', amount: 'totalRevenue', no: 'invoiceNo' },
    { col: COL.purchases, kind: 'purchase', label: 'شراء', amount: 'totalCost', no: 'invoiceNo' },
    { col: COL.expenses, kind: 'expense', label: 'مصروف', amount: 'amount', no: 'number' },
    { col: COL.partnerTx, kind: 'partnerTx', label: 'حركة شريك', amount: 'amount', no: 'number' },
  ]
  const rows = (
    await Promise.all(
      cols.map(async c =>
        (await store.list(c.col)).map(r => ({
          kind: c.kind,
          id: r.id,
          type: c.label,
          number: r.data[c.no] || '',
          amount: round2(Number(r.data[c.amount]) || 0),
          description: r.data.title || r.data.customerName || r.data.supplierName || r.data.partnerName || '',
          createdAt: r.data.createdAt || '',
          cancelled: isCancelled(r.data),
        })),
      ),
    )
  ).flat()
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit)
}
