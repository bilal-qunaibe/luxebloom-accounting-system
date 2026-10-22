import { z } from 'zod'
import { ACC, partnerAccountId } from './accounts.js'
import { COL, fail, iso, notFound, round2, type Ctx } from './core.js'
import { logStock, stockState } from './inventory.js'
import { reserveNumber, writeEntry } from './journal.js'
import type {
  accountCreate,
  customerSave,
  journalCreate,
  partnerSave,
  productDelete,
  productSave,
  supplierSave,
} from './schemas.js'
import type { Store } from '../store.js'

// البيانات الأساسية: المنتجات، العملاء، الموردين، الشركاء، الحسابات والقيود اليدوية

type In<T extends z.ZodTypeAny> = z.infer<T>

// ---------- المنتجات ----------

export async function saveProduct(store: Store, ctx: Ctx, input: In<typeof productSave>) {
  return store.runTransaction(async tx => {
    const sameCode = await tx.query(COL.products, [['code', '==', input.code]], 2)
    if (sameCode.some(s => s.id !== input.id)) fail(`الكود ${input.code} مستخدم لمنتج ثاني`)

    const existing = input.id ? await tx.get(COL.products, input.id) : null
    if (existing && !existing.exists) notFound('المنتج غير موجود')

    const variants = input.variants.filter(v => v.size.trim() !== '').map(v => ({ size: v.size.trim(), quantity: v.quantity }))
    const sizes = new Set(variants.map(v => v.size))
    if (sizes.size !== variants.length) fail('في مقاس مكرر بنفس المنتج')
    const quantity = variants.length ? variants.reduce((s, v) => s + v.quantity, 0) : input.quantity

    const before = existing ? stockState(existing.id, existing.data) : null
    const oldValue = before ? round2(Math.max(before.quantity, 0) * before.purchasePrice) : 0
    const newValue = round2(quantity * input.purchasePrice)
    const diff = round2(newValue - oldValue)

    const year = ctx.now.getUTCFullYear()
    const je = diff !== 0 ? await reserveNumber(tx, 'journal', 'JE', year, 5) : null

    const id = existing ? existing.id : tx.newId(COL.products)
    const data = {
      code: input.code,
      name: input.name,
      nameEn: input.nameEn,
      categoryId: input.categoryId,
      itemType: input.itemType,
      quantity,
      variants,
      weightGram: input.weightGram,
      minQuantity: input.minQuantity,
      minWeight: input.minWeight,
      purchasePrice: round2(input.purchasePrice),
      salePrice: round2(input.salePrice),
      wholesalePrice: round2(input.wholesalePrice),
      purity: input.purity || (input.itemType === 'SILVER' ? '925' : ''),
      isActive: input.isActive,
      updatedAt: iso(ctx.now),
    }

    if (existing) tx.update(COL.products, id, data)
    else tx.set(COL.products, id, { ...data, createdAt: iso(ctx.now), createdBy: ctx.uid })

    if (je) {
      // القيمة الجديدة للمخزون (كمية × تكلفة) لازم تطابق حساب المخزون
      const isOpening = !existing
      const counter = isOpening ? ACC.opening : ACC.inventoryAdjust
      const label = isOpening ? `رصيد افتتاحي للمنتج ${input.name}` : `تعديل مخزون/تكلفة المنتج ${input.name}`
      writeEntry(tx, ctx, je.value, {
        description: label,
        reference: input.code,
        source: { type: 'product', id },
        lines:
          diff > 0
            ? [
                { accountId: ACC.inventory, debit: diff },
                { accountId: counter, credit: diff },
              ]
            : [
                { accountId: counter, debit: -diff },
                { accountId: ACC.inventory, credit: -diff },
              ],
      })
      je.commit(tx)
    }

    const qtyDelta = quantity - (before ? before.quantity : 0)
    if (qtyDelta !== 0) logStock(tx, ctx, id, existing ? 'ADJUSTMENT' : 'OPENING', qtyDelta, '', { type: 'product', id })

    return { id, number: input.code }
  })
}

export async function deleteProduct(store: Store, ctx: Ctx, input: In<typeof productDelete>) {
  return store.runTransaction(async tx => {
    const snap = await tx.get(COL.products, input.id)
    if (!snap.exists) notFound('المنتج غير موجود')
    const p = stockState(snap.id, snap.data)
    if (p.quantity > 0) fail(`ما بصير تحذف منتج إله كمية بالمخزون (${p.quantity}). صفّر الكمية أو عطّل المنتج`)
    tx.delete(COL.products, input.id)
    logStock(tx, ctx, input.id, 'DELETED', 0, '', { type: 'product', id: input.id })
    return { id: input.id }
  })
}

// ---------- العملاء والموردين ----------

export async function saveParty(
  store: Store,
  ctx: Ctx,
  kind: 'customer' | 'supplier',
  input: In<typeof customerSave> | In<typeof supplierSave>,
) {
  const col = kind === 'customer' ? COL.customers : COL.suppliers
  return store.runTransaction(async tx => {
    const existing = input.id ? await tx.get(col, input.id) : null
    if (existing && !existing.exists) notFound(kind === 'customer' ? 'العميل غير موجود' : 'المورد غير موجود')
    const opening = !existing ? round2(input.openingDebt) : 0
    const je = opening > 0 ? await reserveNumber(tx, 'journal', 'JE', ctx.now.getUTCFullYear(), 5) : null

    const id = existing ? existing.id : tx.newId(col)
    const base: Record<string, unknown> = {
      name: input.name,
      phone: input.phone,
      notes: input.notes,
      updatedAt: iso(ctx.now),
    }
    if ('address' in input) base.address = input.address
    if ('company' in input) base.company = input.company

    if (existing) {
      tx.update(col, id, base)
    } else {
      tx.set(col, id, { ...base, debt: opening, openingDebt: opening, openingPosted: true, createdAt: iso(ctx.now), createdBy: ctx.uid })
    }

    if (je) {
      writeEntry(tx, ctx, je.value, {
        description: `رصيد افتتاحي ${kind === 'customer' ? 'للعميل' : 'للمورد'} ${input.name}`,
        source: { type: kind, id },
        lines:
          kind === 'customer'
            ? [
                { accountId: ACC.receivable, debit: opening },
                { accountId: ACC.opening, credit: opening },
              ]
            : [
                { accountId: ACC.opening, debit: opening },
                { accountId: ACC.payable, credit: opening },
              ],
      })
      je.commit(tx)
    }
    return { id }
  })
}

// ---------- الشركاء ----------

export async function savePartner(store: Store, ctx: Ctx, input: In<typeof partnerSave>) {
  return store.runTransaction(async tx => {
    const existing = input.id ? await tx.get(COL.partners, input.id) : null
    if (existing && !existing.exists) notFound('الشريك غير موجود')
    const codeCounter = !existing ? await tx.get(COL.counters, 'partnerAccount') : null

    const id = existing ? existing.id : tx.newId(COL.partners)
    const accountId = partnerAccountId(id)
    const data = {
      name: input.name,
      phone: input.phone,
      sharePercent: input.sharePercent,
      notes: input.notes,
      accountId,
      updatedAt: iso(ctx.now),
    }

    if (existing) {
      tx.update(COL.partners, id, data)
      tx.update(COL.accounts, accountId, { name: `جاري الشريك - ${input.name}` })
    } else {
      const n = (Number(codeCounter!.data.value) || 0) + 1
      tx.set(COL.partners, id, { ...data, createdAt: iso(ctx.now), createdBy: ctx.uid })
      tx.set(COL.accounts, accountId, {
        code: String(3200 + n),
        name: `جاري الشريك - ${input.name}`,
        type: 'EQUITY',
        openingBalance: 0,
        isSystem: true,
        partnerId: id,
        createdAt: iso(ctx.now),
      })
      tx.set(COL.counters, 'partnerAccount', { value: n })
    }
    return { id }
  })
}

// ---------- الحسابات والقيود اليدوية ----------

export async function createAccount(store: Store, ctx: Ctx, input: In<typeof accountCreate>) {
  return store.runTransaction(async tx => {
    const same = await tx.query(COL.accounts, [['code', '==', input.code]], 1)
    if (same.length) fail(`كود الحساب ${input.code} مستخدم`)
    const id = tx.newId(COL.accounts)
    tx.set(COL.accounts, id, {
      code: input.code,
      name: input.name,
      type: input.type,
      openingBalance: round2(input.openingBalance),
      createdAt: iso(ctx.now),
      createdBy: ctx.uid,
    })
    return { id }
  })
}

export async function createManualEntry(store: Store, ctx: Ctx, input: In<typeof journalCreate>) {
  return store.runTransaction(async tx => {
    const ids = new Set<string>()
    for (const i of input.items) {
      if (i.debit > 0 && !i.debitAccountId) fail('حدد الحساب المدين لكل مبلغ مدين')
      if (i.credit > 0 && !i.creditAccountId) fail('حدد الحساب الدائن لكل مبلغ دائن')
      if (i.debit > 0) ids.add(i.debitAccountId!)
      if (i.credit > 0) ids.add(i.creditAccountId!)
    }
    const accounts = await tx.getMany(COL.accounts, [...ids])
    if (accounts.some(a => !a.exists)) fail('أحد الحسابات غير موجود')
    const je = await reserveNumber(tx, 'journal', 'JE', ctx.now.getUTCFullYear(), 5)
    const lines = input.items.flatMap(i => [
      ...(i.debit > 0 ? [{ accountId: i.debitAccountId!, debit: i.debit }] : []),
      ...(i.credit > 0 ? [{ accountId: i.creditAccountId!, credit: i.credit }] : []),
    ])
    const entryNo = input.entryNo || je.value
    const id = writeEntry(tx, ctx, entryNo, {
      description: input.description,
      reference: input.reference,
      source: { type: 'manual', id: '' },
      lines,
    })
    if (!id) fail('القيد فاضي')
    je.commit(tx)
    return { id: id!, number: entryNo }
  })
}
