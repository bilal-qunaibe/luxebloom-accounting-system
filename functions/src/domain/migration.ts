import { ACC, ensureSystemAccounts, expenseAccountId, moneyAccount, normalizeExpenseCategory } from './accounts.js'
import { COL, iso, isCancelled, round2, type Ctx, type PaymentMethod } from './core.js'
import { buildItems, hasAmounts, type Line } from './journal.js'
import { stockState } from './inventory.js'
import type { Doc, Store } from '../store.js'

// ترحيل البيانات القديمة للدفاتر: كل مبيعة ومشترى ومصروف قديم بياخذ قيده
// العملية آمنة للتكرار: أي مستند إله قيد ما بنلمسه مرة ثانية

interface Planned {
  target?: { col: string; id: string; patch: Doc }
  description: string
  reference: string
  date: string
  source: { type: string; id: string }
  lines: Line[]
}

const pm = (v: unknown): PaymentMethod => (v === 'BANK_TRANSFER' || v === 'CREDIT_CARD' ? v : 'CASH')

export async function runMigration(store: Store, ctx: Ctx, dryRun: boolean) {
  await ensureSystemAccounts(store, ctx.now)
  const [sales, purchases, expenses, customers, suppliers, products, entries] = await Promise.all([
    store.list(COL.sales),
    store.list(COL.purchases),
    store.list(COL.expenses),
    store.list(COL.customers),
    store.list(COL.suppliers),
    store.list(COL.products),
    store.list(COL.journal),
  ])

  const plan: Planned[] = []
  const summary = {
    sales: { count: 0, revenue: 0, cost: 0, unpaid: 0 },
    purchases: { count: 0, total: 0, unpaid: 0 },
    expenses: { count: 0, total: 0 },
    customerDebts: { count: 0, total: 0 },
    supplierDebts: { count: 0, total: 0 },
    inventory: { bookValue: 0, actualValue: 0, adjustment: 0 },
    entries: 0,
  }

  for (const s of sales) {
    const d = s.data
    if (d.journalEntryId || d.migratedAt || isCancelled(d)) continue
    const revenue = round2(Number(d.totalRevenue ?? d.total) || 0)
    const cost = round2(Number(d.totalCost) || 0)
    const paid = round2(Math.min(revenue, Number(d.paid ?? revenue) || 0))
    const unpaid = round2(revenue - paid)
    summary.sales.count++
    summary.sales.revenue = round2(summary.sales.revenue + revenue)
    summary.sales.cost = round2(summary.sales.cost + cost)
    summary.sales.unpaid = round2(summary.sales.unpaid + unpaid)
    plan.push({
      target: { col: COL.sales, id: s.id, patch: { status: d.status || 'CONFIRMED', migratedAt: iso(ctx.now) } },
      description: `فاتورة بيع قديمة ${d.invoiceNo || ''}`.trim(),
      reference: d.invoiceNo || '',
      date: d.createdAt || iso(ctx.now),
      source: { type: 'sale', id: s.id },
      lines: [
        { accountId: moneyAccount(pm(d.paymentMethod)), debit: paid },
        { accountId: ACC.receivable, debit: unpaid, description: 'متبقي من فاتورة قديمة' },
        { accountId: ACC.revenue, credit: revenue },
        { accountId: ACC.cogs, debit: cost },
        { accountId: ACC.inventory, credit: cost },
      ],
    })
  }

  for (const p of purchases) {
    const d = p.data
    if (d.journalEntryId || d.migratedAt || isCancelled(d)) continue
    const total = round2(Number(d.totalCost ?? d.total) || 0)
    const paid = round2(Math.min(total, Number(d.paid ?? total) || 0))
    const unpaid = round2(total - paid)
    summary.purchases.count++
    summary.purchases.total = round2(summary.purchases.total + total)
    summary.purchases.unpaid = round2(summary.purchases.unpaid + unpaid)
    plan.push({
      target: { col: COL.purchases, id: p.id, patch: { status: d.status || 'CONFIRMED', migratedAt: iso(ctx.now) } },
      description: `فاتورة شراء قديمة ${d.invoiceNo || ''} - ${d.supplierName || 'مورد عام'}`,
      reference: d.invoiceNo || '',
      date: d.createdAt || iso(ctx.now),
      source: { type: 'purchase', id: p.id },
      lines: [
        { accountId: ACC.inventory, debit: total },
        { accountId: moneyAccount(pm(d.paymentMethod)), credit: paid },
        { accountId: ACC.payable, credit: unpaid, description: 'متبقي من فاتورة قديمة' },
      ],
    })
  }

  for (const e of expenses) {
    const d = e.data
    if (d.journalEntryId || d.migratedAt || isCancelled(d)) continue
    const amount = round2(Number(d.amount ?? d.total) || 0)
    const category = normalizeExpenseCategory(d.category)
    summary.expenses.count++
    summary.expenses.total = round2(summary.expenses.total + amount)
    plan.push({
      target: { col: COL.expenses, id: e.id, patch: { status: d.status || 'CONFIRMED', migratedAt: iso(ctx.now) } },
      description: `مصروف قديم: ${d.title || category}`,
      reference: '',
      date: d.createdAt || (d.date ? `${d.date}T12:00:00.000Z` : iso(ctx.now)),
      source: { type: 'expense', id: e.id },
      lines: [
        { accountId: expenseAccountId(category), debit: amount },
        { accountId: ACC.cash, credit: amount },
      ],
    })
  }

  for (const c of customers) {
    const debt = round2(Number(c.data.debt) || 0)
    if (c.data.openingPosted || debt <= 0) continue
    summary.customerDebts.count++
    summary.customerDebts.total = round2(summary.customerDebts.total + debt)
    plan.push({
      target: { col: COL.customers, id: c.id, patch: { openingPosted: true, openingDebt: debt } },
      description: `رصيد افتتاحي للعميل ${c.data.name || ''}`,
      reference: '',
      date: c.data.createdAt || iso(ctx.now),
      source: { type: 'customer', id: c.id },
      lines: [
        { accountId: ACC.receivable, debit: debt },
        { accountId: ACC.opening, credit: debt },
      ],
    })
  }

  for (const s of suppliers) {
    const debt = round2(Number(s.data.debt) || 0)
    if (s.data.openingPosted || debt <= 0) continue
    summary.supplierDebts.count++
    summary.supplierDebts.total = round2(summary.supplierDebts.total + debt)
    plan.push({
      target: { col: COL.suppliers, id: s.id, patch: { openingPosted: true, openingDebt: debt } },
      description: `رصيد افتتاحي للمورد ${s.data.name || ''}`,
      reference: '',
      date: s.data.createdAt || iso(ctx.now),
      source: { type: 'supplier', id: s.id },
      lines: [
        { accountId: ACC.opening, debit: debt },
        { accountId: ACC.payable, credit: debt },
      ],
    })
  }

  // تسوية حساب المخزون مع قيمة البضاعة الفعلية (الكمية × التكلفة)
  const inventoryFromEntries = entries.reduce((bal, e) => {
      for (const i of e.data.items || []) {
        if (i.debitAccountId === ACC.inventory) bal += Number(i.debit) || 0
        if (i.creditAccountId === ACC.inventory) bal -= Number(i.credit) || 0
      }
      return bal
    }, 0)
  const inventoryFromPlan = plan.reduce(
    (bal, p) => bal + p.lines.reduce((b, l) => b + (l.accountId === ACC.inventory ? (l.debit || 0) - (l.credit || 0) : 0), 0),
    0,
  )
  const bookValue = round2(inventoryFromEntries + inventoryFromPlan)
  const actualValue = round2(
    products.reduce((s, p) => {
      const st = stockState(p.id, p.data)
      return s + Math.max(st.quantity, 0) * st.purchasePrice
    }, 0),
  )
  const adjustment = round2(actualValue - bookValue)
  summary.inventory = { bookValue, actualValue, adjustment }
  if (Math.abs(adjustment) >= 0.01) {
    plan.push({
      description: 'تسوية رصيد المخزون مع البضاعة الفعلية (رصيد افتتاحي)',
      reference: '',
      date: iso(ctx.now),
      source: { type: 'migration', id: 'inventory' },
      lines:
        adjustment > 0
          ? [
              { accountId: ACC.inventory, debit: adjustment },
              { accountId: ACC.opening, credit: adjustment },
            ]
          : [
              { accountId: ACC.opening, debit: -adjustment },
              { accountId: ACC.inventory, credit: -adjustment },
            ],
    })
  }

  const withEntries = plan.filter(p => hasAmounts(p.lines))
  summary.entries = withEntries.length
  // تحقق من توازن كل القيود قبل ما نكتب أي إشي
  for (const p of withEntries) buildItems(p.lines)

  if (dryRun || plan.length === 0) return { dryRun: true, summary }

  // حجز أرقام القيود دفعة وحدة
  const year = ctx.now.getUTCFullYear()
  const counterId = `journal_${year}`
  const start = await store.runTransaction(async tx => {
    const snap = await tx.get(COL.counters, counterId)
    const current = Number(snap.data.value) || 0
    tx.set(COL.counters, counterId, { value: current + withEntries.length })
    return current
  })

  let n = start
  const chunks: Array<Array<{ col: string; id: string; data: Doc; merge?: boolean }>> = [[]]
  for (const p of plan) {
    const group: Array<{ col: string; id: string; data: Doc; merge?: boolean }> = []
    let entryId: string | null = null
    if (hasAmounts(p.lines)) {
      n++
      entryId = store.newId(COL.journal)
      const { items, totalDebit, totalCredit } = buildItems(p.lines)
      group.push({
        col: COL.journal,
        id: entryId,
        data: {
          entryNo: `JE-${year}-${String(n).padStart(5, '0')}`,
          description: p.description,
          reference: p.reference,
          items,
          totalDebit,
          totalCredit,
          date: p.date,
          createdAt: p.date,
          status: 'POSTED',
          source: p.source,
          origin: 'system',
          createdBy: ctx.uid,
          migrated: true,
        },
      })
    }
    if (p.target) {
      const key = p.target.col === COL.customers || p.target.col === COL.suppliers ? 'openingEntryId' : 'journalEntryId'
      group.push({ col: p.target.col, id: p.target.id, data: { ...p.target.patch, [key]: entryId }, merge: true })
    }
    if (chunks[chunks.length - 1].length + group.length > 400) chunks.push([])
    chunks[chunks.length - 1].push(...group)
  }
  for (const chunk of chunks) if (chunk.length) await store.batchWrite(chunk)

  await store.batchWrite([{ col: COL.meta, id: 'migration', data: { lastRunAt: iso(ctx.now), lastRunBy: ctx.uid, summary }, merge: true }])
  return { dryRun: false, summary }
}
