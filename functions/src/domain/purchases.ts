import { ACC, moneyAccount } from './accounts.js'
import { COL, CURRENCY_LABEL, fail, iso, notFound, round2, sum, toBase, type Ctx } from './core.js'
import { loadStock, logStock, moveStock, readRates, writeStock } from './inventory.js'
import { docDate, reserveNumber, writeEntry } from './journal.js'
import type { PurchaseCreate } from './schemas.js'
import type { Reader, Store } from '../store.js'

// فاتورة الشراء: إدخال المخزون + تحديث متوسط التكلفة + قيد المشتريات + دين المورد

export async function preparePurchase(r: Reader, input: PurchaseCreate) {
  const rates = await readRates(r)
  const { rate } = toBase(1, input.currency, input.rate, rates)
  const stock = await loadStock(r, input.items.map(i => i.productId))
  const supplier = input.supplierId ? await r.get(COL.suppliers, input.supplierId) : null
  if (supplier && !supplier.exists) notFound('المورد غير موجود')

  const costUpdates = new Map<string, number>()
  const items = input.items.map(i => {
    const p = stock.get(i.productId)!
    const unitCost = round2(i.unitCost * rate)
    const oldQty = Math.max(p.quantity, 0)
    const oldCost = costUpdates.get(p.id) ?? p.purchasePrice
    moveStock(p, i.size, i.quantity, { allowNewSize: true })
    // متوسط التكلفة المرجح
    const avg = oldQty + i.quantity > 0 ? (oldQty * oldCost + i.quantity * unitCost) / (oldQty + i.quantity) : unitCost
    costUpdates.set(p.id, round2(avg))
    return {
      itemType: p.data.itemType || 'OTHER',
      productId: p.id,
      name: p.name,
      size: i.size || '',
      quantity: i.quantity,
      unitCost,
      unitCostOriginal: round2(i.unitCost),
      total: round2(i.quantity * unitCost),
    }
  })

  const totalOriginal = sum(input.items.map(i => i.quantity * i.unitCost))
  const paidOriginal = round2(input.paid ?? totalOriginal)
  if (paidOriginal - totalOriginal > 0.009) fail('المبلغ المدفوع أكبر من قيمة الفاتورة')

  const totalCost = sum(items.map(i => i.total))
  const paid = paidOriginal === totalOriginal ? totalCost : Math.min(totalCost, round2(paidOriginal * rate))
  const remaining = round2(totalCost - paid)
  if (remaining > 0 && !supplier) fail('في مبلغ متبقي للمورد، حدد المورد عشان ينسجل كدين')

  return {
    stock,
    costUpdates,
    items,
    rate,
    totalOriginal,
    paidOriginal,
    totalCost,
    paid,
    remaining,
    supplier: supplier
      ? { id: supplier.id, name: String(supplier.data.name || ''), debt: Number(supplier.data.debt) || 0 }
      : null,
  }
}

export async function createPurchase(store: Store, ctx: Ctx, input: PurchaseCreate) {
  return store.runTransaction(async tx => {
    const prep = await preparePurchase(tx, input)
    const year = ctx.now.getUTCFullYear()
    const num = await reserveNumber(tx, 'purchase', 'PUR', year)
    const je = await reserveNumber(tx, 'journal', 'JE', year, 5)

    const purchaseId = tx.newId(COL.purchases)
    const createdAt = docDate(ctx, input.date)
    const supplierName = prep.supplier?.name || input.supplierName || 'مورد عام'
    const currencyNote = input.currency === 'ILS' ? '' : ` (${prep.totalOriginal} ${CURRENCY_LABEL[input.currency]} × ${prep.rate})`

    const entryId = writeEntry(tx, ctx, je.value, {
      description: `فاتورة شراء ${num.value} - ${supplierName}${currencyNote}`,
      reference: num.value,
      date: createdAt,
      source: { type: 'purchase', id: purchaseId },
      lines: [
        { accountId: ACC.inventory, debit: prep.totalCost, description: 'إدخال للمخزون' },
        { accountId: moneyAccount(input.paymentMethod), credit: prep.paid, description: 'المدفوع' },
        { accountId: ACC.payable, credit: prep.remaining, description: 'المتبقي للمورد' },
      ],
    })

    tx.set(COL.purchases, purchaseId, {
      invoiceNo: num.value,
      supplierId: prep.supplier?.id || null,
      supplierName,
      items: prep.items,
      totalCost: prep.totalCost,
      paid: prep.paid,
      remaining: prep.remaining,
      currency: input.currency,
      rate: prep.rate,
      totalOriginal: prep.totalOriginal,
      paidOriginal: prep.paidOriginal,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdAt,
      recordedAt: iso(ctx.now),
      status: 'CONFIRMED',
      journalEntryId: entryId,
      origin: ctx.origin,
      createdBy: ctx.uid,
    })

    for (const p of prep.stock.values()) {
      writeStock(tx, p, { purchasePrice: prep.costUpdates.get(p.id) ?? p.purchasePrice, updatedAt: iso(ctx.now) })
    }
    for (const i of prep.items) logStock(tx, ctx, i.productId, 'PURCHASE', i.quantity, i.size, { type: 'purchase', id: purchaseId })

    if (prep.supplier && prep.remaining > 0) {
      tx.update(COL.suppliers, prep.supplier.id, {
        debt: round2(prep.supplier.debt + prep.remaining),
        updatedAt: iso(ctx.now),
      })
    }

    num.commit(tx)
    if (entryId) je.commit(tx)

    return { id: purchaseId, number: num.value, totalCost: prep.totalCost, paid: prep.paid, remaining: prep.remaining }
  })
}
