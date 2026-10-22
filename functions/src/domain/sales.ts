import { ACC, moneyAccount } from './accounts.js'
import { COL, fail, iso, notFound, round2, sum, type Ctx } from './core.js'
import { loadStock, logStock, moveStock, writeStock } from './inventory.js'
import { docDate, reserveNumber, writeEntry } from './journal.js'
import type { SaleCreate } from './schemas.js'
import type { Reader, Store } from '../store.js'

// فاتورة البيع: خصم المخزون + قيد الإيراد + قيد التكلفة + دين العميل، كلها بعملية وحدة

export async function prepareSale(r: Reader, input: SaleCreate) {
  const stock = await loadStock(r, input.items.map(i => i.productId))
  const customer = input.customerId ? await r.get(COL.customers, input.customerId) : null
  if (customer && !customer.exists) notFound('العميل غير موجود')

  const items = input.items.map(i => {
    const p = stock.get(i.productId)!
    if (p.data.isActive === false) fail(`المنتج "${p.name}" معطل`)
    moveStock(p, i.size, -i.quantity)
    return {
      itemType: p.data.itemType || 'OTHER',
      productId: p.id,
      name: p.name,
      size: i.size || '',
      quantity: i.quantity,
      purchasePrice: round2(p.purchasePrice),
      unitPrice: round2(i.unitPrice),
      total: round2(i.quantity * i.unitPrice),
    }
  })

  const totalRevenue = sum(items.map(i => i.total))
  const totalCost = sum(items.map(i => i.quantity * i.purchasePrice))
  const paid = round2(input.paid ?? totalRevenue)
  if (paid - totalRevenue > 0.009) fail('المبلغ المدفوع أكبر من قيمة الفاتورة')
  const remaining = round2(totalRevenue - paid)
  if (remaining > 0 && !customer) fail('في مبلغ متبقي على الفاتورة، حدد العميل عشان ينسجل عليه كدين')

  return {
    stock,
    items,
    totalRevenue,
    totalCost,
    netProfit: round2(totalRevenue - totalCost),
    paid,
    remaining,
    customer: customer ? { id: customer.id, name: String(customer.data.name || ''), debt: Number(customer.data.debt) || 0 } : null,
  }
}

export async function createSale(store: Store, ctx: Ctx, input: SaleCreate) {
  return store.runTransaction(async tx => {
    const prep = await prepareSale(tx, input)
    const year = ctx.now.getUTCFullYear()
    const inv = await reserveNumber(tx, 'sale', 'INV', year)
    const je = await reserveNumber(tx, 'journal', 'JE', year, 5)

    const saleId = tx.newId(COL.sales)
    const createdAt = docDate(ctx, input.date)
    const entryId = writeEntry(tx, ctx, je.value, {
      description: `فاتورة بيع ${inv.value}${prep.customer ? ` - ${prep.customer.name}` : ''}`,
      reference: inv.value,
      date: createdAt,
      source: { type: 'sale', id: saleId },
      lines: [
        { accountId: moneyAccount(input.paymentMethod), debit: prep.paid, description: 'المقبوض' },
        { accountId: ACC.receivable, debit: prep.remaining, description: 'المتبقي على العميل' },
        { accountId: ACC.revenue, credit: prep.totalRevenue, description: 'إيراد المبيعات' },
        { accountId: ACC.cogs, debit: prep.totalCost, description: 'تكلفة البضاعة' },
        { accountId: ACC.inventory, credit: prep.totalCost, description: 'خروج من المخزون' },
      ],
    })

    tx.set(COL.sales, saleId, {
      invoiceNo: inv.value,
      customerId: prep.customer?.id || null,
      customerName: prep.customer?.name || 'عميل نقدي',
      items: prep.items,
      totalRevenue: prep.totalRevenue,
      totalCost: prep.totalCost,
      netProfit: prep.netProfit,
      paid: prep.paid,
      remaining: prep.remaining,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdAt,
      recordedAt: iso(ctx.now),
      status: 'CONFIRMED',
      journalEntryId: entryId,
      origin: ctx.origin,
      createdBy: ctx.uid,
    })

    for (const p of prep.stock.values()) writeStock(tx, p, { updatedAt: iso(ctx.now) })
    for (const i of prep.items) logStock(tx, ctx, i.productId, 'SALE', -i.quantity, i.size, { type: 'sale', id: saleId })

    if (prep.customer && prep.remaining > 0) {
      tx.update(COL.customers, prep.customer.id, {
        debt: round2(prep.customer.debt + prep.remaining),
        updatedAt: iso(ctx.now),
      })
    }

    inv.commit(tx)
    if (entryId) je.commit(tx)

    return {
      id: saleId,
      number: inv.value,
      totalRevenue: prep.totalRevenue,
      paid: prep.paid,
      remaining: prep.remaining,
      netProfit: prep.netProfit,
    }
  })
}
