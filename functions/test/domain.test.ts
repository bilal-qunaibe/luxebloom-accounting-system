import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACC, partnerAccountId } from '../src/domain/accounts.js'
import { resolveMember } from '../src/domain/actions.js'
import { COL } from '../src/domain/core.js'
import { assertBooksHealthy, balance, seedProduct, setup } from './helpers.js'

describe('sales', () => {
  it('sells from a size, deducts stock and posts revenue + cost', async () => {
    const { store, act } = setup()
    const ring = await seedProduct(act, { variants: [{ size: '7', quantity: 3 }, { size: '8', quantity: 2 }] })
    const bear = await seedProduct(act, { code: 'B1', name: 'دبدوب', itemType: 'OTHER', quantity: 10, purchasePrice: 8, salePrice: 30 })

    const res = await act('sale.create', {
      items: [
        { productId: ring, size: '7', quantity: 1, unitPrice: 200 },
        { productId: bear, quantity: 1, unitPrice: 0 },
      ],
    })

    assert.equal(res.number, 'INV-2026-0001')
    assert.equal(res.totalRevenue, 200)
    const p = store.doc(COL.products, ring)!
    assert.deepEqual(p.variants, [{ size: '7', quantity: 2 }, { size: '8', quantity: 2 }])
    assert.equal(p.quantity, 4)
    assert.equal(store.doc(COL.products, bear)!.quantity, 9)

    const sale = store.doc(COL.sales, res.id)!
    assert.equal(sale.customerName, 'عميل نقدي')
    assert.equal(sale.totalCost, 58)
    assert.equal(sale.netProfit, 142)
    assert.equal(sale.status, 'CONFIRMED')
    assert.ok(sale.journalEntryId)

    assert.equal(balance(store, ACC.cash), 200)
    assert.equal(balance(store, ACC.revenue), -200)
    assert.equal(balance(store, ACC.cogs), 58)
    assertBooksHealthy(store)

    const second = await act('sale.create', { items: [{ productId: bear, quantity: 1, unitPrice: 30 }] })
    assert.equal(second.number, 'INV-2026-0002')
  })

  it('rejects selling more than stock and writes nothing', async () => {
    const { store, act } = setup()
    const ring = await seedProduct(act, { variants: [{ size: '7', quantity: 1 }] })
    const entriesBefore = store.all(COL.journal).length
    await assert.rejects(act('sale.create', { items: [{ productId: ring, size: '7', quantity: 2, unitPrice: 100 }] }), /الكمية غير كافية/)
    await assert.rejects(act('sale.create', { items: [{ productId: ring, quantity: 1, unitPrice: 100 }] }), /حدد المقاس/)
    assert.equal(store.all(COL.sales).length, 0)
    assert.equal(store.all(COL.journal).length, entriesBefore)
    assert.equal(store.doc(COL.products, ring)!.quantity, 1)
  })

  it('needs a customer for unpaid amounts and records the debt', async () => {
    const { store, act } = setup()
    const ring = await seedProduct(act, { quantity: 5 })
    await assert.rejects(act('sale.create', { items: [{ productId: ring, quantity: 1, unitPrice: 150 }], paid: 100 }), /حدد العميل/)
    const c = await act('customer.save', { name: 'أم محمد', phone: '0599' })
    await act('sale.create', { items: [{ productId: ring, quantity: 1, unitPrice: 150 }], paid: 100, customerId: c.id })
    assert.equal(store.doc(COL.customers, c.id)!.debt, 50)
    assert.equal(balance(store, ACC.receivable), 50)
    await assert.rejects(act('sale.create', { items: [{ productId: ring, quantity: 1, unitPrice: 150 }], paid: 200 }), /أكبر من قيمة/)
    assertBooksHealthy(store)
  })
})

describe('purchases', () => {
  it('adds stock, averages the cost and handles USD + supplier debt', async () => {
    const { store, act } = setup()
    const ring = await seedProduct(act, { quantity: 10, purchasePrice: 20 })
    await act('purchase.create', { items: [{ productId: ring, quantity: 10, unitCost: 30 }] })
    let p = store.doc(COL.products, ring)!
    assert.equal(p.quantity, 20)
    assert.equal(p.purchasePrice, 25)

    await act('settings.update', { rates: { USD: 3.6 } })
    const sup = await act('supplier.save', { name: 'تاجر اسطنبول' })
    const res = await act('purchase.create', {
      items: [{ productId: ring, quantity: 5, unitCost: 10 }],
      currency: 'USD',
      paid: 20,
      supplierId: sup.id,
    })
    const pur = store.doc(COL.purchases, res.id)!
    assert.equal(pur.totalCost, 180)
    assert.equal(pur.paid, 72)
    assert.equal(pur.remaining, 108)
    assert.equal(store.doc(COL.suppliers, sup.id)!.debt, 108)
    p = store.doc(COL.products, ring)!
    assert.equal(p.quantity, 25)
    assert.equal(p.purchasePrice, 27.2)
    assertBooksHealthy(store)
  })

  it('can add a new size when buying', async () => {
    const { store, act } = setup()
    const ring = await seedProduct(act, { variants: [{ size: '7', quantity: 1 }] })
    await act('purchase.create', { items: [{ productId: ring, size: '9', quantity: 2, unitCost: 50 }] })
    assert.deepEqual(store.doc(COL.products, ring)!.variants, [{ size: '7', quantity: 1 }, { size: '9', quantity: 2 }])
    assertBooksHealthy(store)
  })
})

describe('expenses and partners', () => {
  it('records an expense under the right account', async () => {
    const { store, act } = setup()
    const res = await act('expense.create', { title: 'اشتريت بضاعة', amount: 40, category: 'مشتريات ومستلزمات' })
    const e = store.doc(COL.expenses, res.id)!
    assert.equal(e.amount, 40)
    assert.equal(e.title, 'اشتريت بضاعة')
    assert.equal(balance(store, 'sys_exp_8'), 40)
    assert.equal(balance(store, ACC.cash), -40)

    await act('expense.create', { title: 'إشي', amount: 10, category: 'تصنيف غريب' })
    assert.equal(balance(store, 'sys_exp_9'), 10)
    await assert.rejects(act('expense.create', { title: 'x', amount: 0 }), /أكبر من صفر/)
    assertBooksHealthy(store)
  })

  it('pays a partner in dollars', async () => {
    const { store, act } = setup()
    await act('settings.update', { rates: { USD: 3.7 } })
    const partner = await act('partner.save', { name: 'أحمد', sharePercent: 50 })
    assert.ok(store.doc(COL.accounts, partnerAccountId(partner.id)))
    const res = await act('partner.transaction', { partnerId: partner.id, kind: 'WITHDRAWAL', amount: 500, currency: 'USD' })
    const t = store.doc(COL.partnerTx, res.id)!
    assert.equal(t.amount, 1850)
    assert.equal(t.originalAmount, 500)
    assert.equal(balance(store, partnerAccountId(partner.id)), 1850)
    assert.equal(balance(store, ACC.cash), -1850)

    await act('partner.transaction', { partnerId: partner.id, kind: 'CONTRIBUTION', amount: 1000 })
    assert.equal(balance(store, ACC.cash), -850)
    assertBooksHealthy(store)
  })
})

describe('payments and cancellation', () => {
  it('collects customer debt and refuses overpaying', async () => {
    const { store, act } = setup()
    const c = await act('customer.save', { name: 'سارة', openingDebt: 300 })
    assert.equal(balance(store, ACC.receivable), 300)
    await assert.rejects(act('customer.payment', { partyId: c.id, amount: 400 }), /أكبر من الدين/)
    await act('customer.payment', { partyId: c.id, amount: 100, paymentMethod: 'BANK_TRANSFER' })
    assert.equal(store.doc(COL.customers, c.id)!.debt, 200)
    assert.equal(balance(store, ACC.bank), 100)
    assertBooksHealthy(store)
  })

  it('cancels a sale: stock back, debt back, books net to zero', async () => {
    const { store, act } = setup()
    const ring = await seedProduct(act, { variants: [{ size: '7', quantity: 2 }] })
    const c = await act('customer.save', { name: 'ليلى' })
    const sale = await act('sale.create', { items: [{ productId: ring, size: '7', quantity: 2, unitPrice: 100 }], paid: 50, customerId: c.id })
    await act('document.reverse', { kind: 'sale', id: sale.id, reason: 'غلط' })

    assert.equal(store.doc(COL.products, ring)!.quantity, 2)
    assert.equal(store.doc(COL.customers, c.id)!.debt, 0)
    assert.equal(store.doc(COL.sales, sale.id)!.status, 'CANCELLED')
    assert.equal(balance(store, ACC.revenue), 0)
    assert.equal(balance(store, ACC.cash), 0)
    assert.equal(balance(store, ACC.receivable), 0)
    await assert.rejects(act('document.reverse', { kind: 'sale', id: sale.id }), /ملغي من قبل/)
    assertBooksHealthy(store)
  })

  it('will not cancel a purchase whose stock was already sold', async () => {
    const { act } = setup()
    const ring = await seedProduct(act, { quantity: 0 })
    const pur = await act('purchase.create', { items: [{ productId: ring, quantity: 2, unitCost: 40 }] })
    await act('sale.create', { items: [{ productId: ring, quantity: 2, unitPrice: 90 }] })
    await assert.rejects(act('document.reverse', { kind: 'purchase', id: pur.id }), /الكمية غير كافية/)
  })

  it('cancels an expense and a partner transaction', async () => {
    const { store, act } = setup()
    const exp = await act('expense.create', { title: 'إعلان', amount: 75, category: 'تسويق وإعلانات' })
    await act('document.reverse', { kind: 'expense', id: exp.id })
    assert.equal(balance(store, ACC.cash), 0)
    assert.equal(store.doc(COL.expenses, exp.id)!.status, 'CANCELLED')
    assertBooksHealthy(store)
  })
})

describe('products and manual accounting', () => {
  it('posts opening stock and adjustments so the inventory account always matches', async () => {
    const { store, act } = setup()
    const id = await seedProduct(act, { quantity: 4, purchasePrice: 25 })
    assert.equal(balance(store, ACC.inventory), 100)
    assert.equal(balance(store, ACC.opening), -100)
    await act('product.save', { id, code: 'P1', name: 'خاتم فضة', quantity: 3, purchasePrice: 25, salePrice: 150 })
    assert.equal(balance(store, ACC.inventory), 75)
    assert.equal(balance(store, ACC.inventoryAdjust), 25)
    await assert.rejects(act('product.save', { code: 'P1', name: 'ثاني' }), /مستخدم/)
    await assert.rejects(act('product.delete', { id }), /ما بصير تحذف/)
    assertBooksHealthy(store)
  })

  it('validates manual entries and reverses only manual ones', async () => {
    const { store, act } = setup()
    await assert.rejects(
      act('journal.create', { description: 'x', items: [{ debitAccountId: ACC.cash, creditAccountId: ACC.opening, debit: 10, credit: 5 }] }),
      /غير متوازن/,
    )
    const je = await act('journal.create', {
      description: 'رأس مال',
      items: [{ debitAccountId: ACC.cash, creditAccountId: ACC.opening, debit: 1000, credit: 1000 }],
    })
    await act('document.reverse', { kind: 'journal', id: je.id })
    assert.equal(balance(store, ACC.cash), 0)

    const exp = await act('expense.create', { title: 'x', amount: 5 })
    const autoId = store.doc(COL.expenses, exp.id)!.journalEntryId
    await assert.rejects(act('document.reverse', { kind: 'journal', id: autoId }), /قيد تلقائي/)
  })

  it('keeps owner-only actions for owners', async () => {
    const { act } = setup()
    await assert.rejects(act('settings.update', { rates: { USD: 3 } }, { role: 'staff' }), /لصاحب الحساب/)
    await assert.rejects(act('nope', {}), /غير معروفة/)
  })
})

describe('access', () => {
  it('lets configured owners in and keeps everyone else out', async () => {
    const { store } = setup()
    await assert.rejects(resolveMember(store, undefined, ['a@b.c']), /تسجل دخول/)
    await assert.rejects(resolveMember(store, { uid: 'x', email: 'employee@manasra.ps' }, ['owner@test.ps']), /غير مصرح/)
    const ctx = await resolveMember(store, { uid: 'u1', email: 'Owner@Test.ps' }, ['owner@test.ps'])
    assert.equal(ctx.role, 'owner')
    assert.equal(store.doc(COL.members, 'u1')!.role, 'owner')
    const again = await resolveMember(store, { uid: 'u1', email: 'owner@test.ps' }, [])
    assert.equal(again.role, 'owner')
  })
})
