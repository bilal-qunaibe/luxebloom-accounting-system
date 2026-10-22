import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACC } from '../src/domain/accounts.js'
import { COL } from '../src/domain/core.js'
import { assertBooksHealthy, balance, setup } from './helpers.js'

// بيانات بنفس الشكل اللي كانت الصفحات القديمة تكتبه
function seedLegacy(store: ReturnType<typeof setup>['store']) {
  store.seed(COL.products, 'old1', { code: 'R1', name: 'خاتم قديم', itemType: 'SILVER', quantity: 6, variants: [{ size: '7', quantity: 6 }], purchasePrice: 40, salePrice: 120 })
  store.seed(COL.products, 'old2', { code: 'S1', name: 'سنسال', itemType: 'STEEL', quantity: 10, purchasePrice: 15, salePrice: 45 })
  store.seed(COL.sales, 's1', {
    invoiceNo: 'INV-482913',
    customerName: 'عميل نقدي',
    items: [{ itemType: 'SILVER', productId: 'old1', name: 'خاتم قديم', size: '7', quantity: 2, purchasePrice: 40, unitPrice: 120, total: 240 }],
    totalRevenue: 240,
    totalCost: 80,
    netProfit: 160,
    paid: 200,
    paymentMethod: 'CASH',
    notes: '',
    createdAt: '2026-05-10T09:00:00.000Z',
  })
  store.seed(COL.purchases, 'p1', {
    invoiceNo: 'PUR-112233',
    supplierName: 'مورد عام',
    items: [{ productId: 'old2', name: 'سنسال', quantity: 10, unitCost: 15, total: 150 }],
    totalCost: 150,
    paid: 150,
    paymentMethod: 'CASH',
    createdAt: '2026-04-01T09:00:00.000Z',
  })
  store.seed(COL.expenses, 'e1', { title: 'كهربا', amount: 120, category: 'فواتير (كهرباء، ماء، إنترنت)', date: '2026-05-01', createdAt: '2026-05-01T08:00:00.000Z' })
  store.seed(COL.customers, 'c1', { name: 'زبونة قديمة', phone: '059', debt: 90, createdAt: '2026-03-01T08:00:00.000Z' })
  store.seed(COL.suppliers, 'sp1', { name: 'مورد قديم', debt: 500, createdAt: '2026-03-01T08:00:00.000Z' })
}

describe('migration of old data', () => {
  it('previews without writing, then posts every legacy document once', async () => {
    const { store, act } = setup()
    seedLegacy(store)

    const preview = await act('migration.run', { dryRun: true })
    assert.equal(preview.dryRun, true)
    assert.equal(preview.summary.sales.count, 1)
    assert.equal(preview.summary.sales.unpaid, 40)
    assert.equal(preview.summary.purchases.count, 1)
    assert.equal(preview.summary.expenses.total, 120)
    assert.equal(preview.summary.customerDebts.total, 90)
    assert.equal(preview.summary.supplierDebts.total, 500)
    assert.equal(preview.summary.inventory.actualValue, 390)
    assert.equal(store.all(COL.journal).length, 0)

    const run = await act('migration.run', { dryRun: false })
    assert.equal(run.dryRun, false)
    assertBooksHealthy(store)
    assert.equal(balance(store, ACC.inventory), 390)
    assert.equal(balance(store, ACC.revenue), -240)
    assert.equal(balance(store, ACC.receivable), 130)
    assert.equal(balance(store, ACC.payable), -500)
    assert.ok(store.doc(COL.sales, 's1')!.journalEntryId)
    assert.ok(store.doc(COL.customers, 'c1')!.openingPosted)
    const numbers = store.all(COL.journal).map(e => e.entryNo).sort()
    assert.equal(new Set(numbers).size, numbers.length)

    const entries = store.all(COL.journal).length
    const again = await act('migration.run', { dryRun: false })
    assert.equal(again.summary.entries, 0)
    assert.equal(store.all(COL.journal).length, entries)
  })

  it('keeps working on top of migrated data (sell an old product, then cancel it)', async () => {
    const { store, act } = setup()
    seedLegacy(store)
    await act('migration.run', { dryRun: false })
    const sale = await act('sale.create', { items: [{ productId: 'old1', size: '7', quantity: 1, unitPrice: 130 }] })
    assertBooksHealthy(store)
    await act('document.reverse', { kind: 'sale', id: sale.id })
    assertBooksHealthy(store)
    // إلغاء فاتورة قديمة مرحّلة
    await act('document.reverse', { kind: 'sale', id: 's1' })
    assert.equal(store.doc(COL.products, 'old1')!.quantity, 8)
    assertBooksHealthy(store)
  })
})
