import { z } from 'zod'
import { COL, fail, iso, notFound, round2, type Ctx } from './core.js'
import { loadStock, logStock, moveStock, writeStock } from './inventory.js'
import { reserveNumber, reverseLines, writeEntry } from './journal.js'
import type { reverseDoc } from './schemas.js'
import type { Store } from '../store.js'

// إلغاء أي عملية: بنعمل قيد عكسي ونرجع أثرها (مخزون/ديون)، وما بنحذف إشي من السجل

const KIND = {
  sale: { col: COL.sales, label: 'فاتورة البيع' },
  purchase: { col: COL.purchases, label: 'فاتورة الشراء' },
  expense: { col: COL.expenses, label: 'المصروف' },
  partnerTx: { col: COL.partnerTx, label: 'حركة الشريك' },
  customerPayment: { col: COL.customerPayments, label: 'دفعة العميل' },
  supplierPayment: { col: COL.supplierPayments, label: 'دفعة المورد' },
  journal: { col: COL.journal, label: 'القيد' },
} as const

export async function reverseDocument(store: Store, ctx: Ctx, input: z.infer<typeof reverseDoc>) {
  const cfg = KIND[input.kind]
  return store.runTransaction(async tx => {
    const snap = await tx.get(cfg.col, input.id)
    if (!snap.exists) notFound(`${cfg.label} غير موجود`)
    const doc = snap.data

    // ---- القيود اليدوية ----
    if (input.kind === 'journal') {
      if (doc.status === 'REVERSED') fail('القيد ملغي من قبل')
      if (doc.source?.type && doc.source.type !== 'manual') fail('هاد قيد تلقائي، ألغِ المستند الأصلي بدل القيد')
      const je = await reserveNumber(tx, 'journal', 'JE', ctx.now.getUTCFullYear(), 5)
      const revId = writeEntry(tx, ctx, je.value, {
        description: `إلغاء قيد ${doc.entryNo}: ${doc.description || ''}`,
        reference: doc.entryNo,
        source: { type: 'journalReversal', id: snap.id },
        lines: reverseLines(doc),
      })
      tx.update(COL.journal, snap.id, { status: 'REVERSED', reversedBy: revId, reversedAt: iso(ctx.now) })
      je.commit(tx)
      return { id: snap.id, number: je.value }
    }

    if (doc.status === 'CANCELLED') fail(`${cfg.label} ملغي من قبل`)

    // كل القراءات قبل أي كتابة
    const entry = doc.journalEntryId ? await tx.get(COL.journal, doc.journalEntryId) : null
    const stock =
      (input.kind === 'sale' || input.kind === 'purchase') && Array.isArray(doc.items)
        ? await loadStock(tx, doc.items.map((i: any) => String(i.productId)).filter(Boolean), { skipMissing: true })
        : null
    let party: { col: string; id: string; debt: number; delta: number } | null = null
    if (input.kind === 'sale' && doc.customerId && Number(doc.remaining) > 0) {
      const c = await tx.get(COL.customers, doc.customerId)
      if (c.exists) party = { col: COL.customers, id: c.id, debt: Number(c.data.debt) || 0, delta: -Number(doc.remaining) }
    }
    if (input.kind === 'purchase' && doc.supplierId && Number(doc.remaining) > 0) {
      const s = await tx.get(COL.suppliers, doc.supplierId)
      if (s.exists) party = { col: COL.suppliers, id: s.id, debt: Number(s.data.debt) || 0, delta: -Number(doc.remaining) }
    }
    if (input.kind === 'customerPayment' || input.kind === 'supplierPayment') {
      const col = input.kind === 'customerPayment' ? COL.customers : COL.suppliers
      const p = await tx.get(col, doc.partyId)
      if (p.exists) party = { col, id: p.id, debt: Number(p.data.debt) || 0, delta: Number(doc.amount) || 0 }
    }
    const je = entry?.exists ? await reserveNumber(tx, 'journal', 'JE', ctx.now.getUTCFullYear(), 5) : null

    // إرجاع المخزون
    if (stock) {
      for (const item of doc.items) {
        const p = stock.get(String(item.productId))
        if (!p) continue
        const q = Number(item.quantity) || 0
        moveStock(p, String(item.size || ''), input.kind === 'sale' ? q : -q, { allowNewSize: true })
      }
    }

    // ---- الكتابة ----
    let revId: string | null = null
    if (entry?.exists && je) {
      revId = writeEntry(tx, ctx, je.value, {
        description: `إلغاء ${cfg.label} ${doc.invoiceNo || doc.number || ''}`.trim(),
        reference: doc.invoiceNo || doc.number || '',
        source: { type: `${input.kind}Reversal`, id: snap.id },
        lines: reverseLines(entry.data),
      })
      tx.update(COL.journal, entry.id, { status: 'REVERSED', reversedBy: revId, reversedAt: iso(ctx.now) })
      je.commit(tx)
    }

    if (stock) {
      for (const p of stock.values()) writeStock(tx, p, { updatedAt: iso(ctx.now) })
      for (const item of doc.items) {
        const q = Number(item.quantity) || 0
        logStock(tx, ctx, String(item.productId), input.kind === 'sale' ? 'SALE_CANCEL' : 'PURCHASE_CANCEL', input.kind === 'sale' ? q : -q, String(item.size || ''), {
          type: input.kind,
          id: snap.id,
        })
      }
    }

    if (party) tx.update(party.col, party.id, { debt: round2(Math.max(0, party.debt + party.delta)), updatedAt: iso(ctx.now) })

    tx.update(cfg.col, snap.id, {
      status: 'CANCELLED',
      cancelledAt: iso(ctx.now),
      cancelledBy: ctx.uid,
      cancelReason: input.reason,
      reversalEntryId: revId,
    })

    return { id: snap.id, number: doc.invoiceNo || doc.number || '' }
  })
}
