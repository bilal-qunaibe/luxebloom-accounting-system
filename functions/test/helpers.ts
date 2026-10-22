import assert from 'node:assert/strict'
import { ACC, resetChartCache } from '../src/domain/accounts.js'
import { runAction } from '../src/domain/actions.js'
import { COL, round2, type Ctx } from '../src/domain/core.js'
import { stockState } from '../src/domain/inventory.js'
import { MemoryStore } from './memoryStore.js'

export function setup() {
  resetChartCache()
  const store = new MemoryStore()
  const ctx: Ctx = { uid: 'owner1', email: 'owner@test.ps', role: 'owner', origin: 'ui', now: new Date('2026-10-22T10:00:00Z') }
  const act = (type: string, payload: unknown, c: Partial<Ctx> = {}) => runAction(store, { ...ctx, ...c }, type, payload)
  return { store, ctx, act }
}

export function balance(store: MemoryStore, accountId: string) {
  let bal = 0
  for (const e of store.all(COL.journal)) {
    for (const i of e.items || []) {
      if (i.debitAccountId === accountId) bal += i.debit
      if (i.creditAccountId === accountId) bal -= i.credit
    }
  }
  return round2(bal)
}

// قواعد لازم تضل صحيحة بعد أي عملية
export function assertBooksHealthy(store: MemoryStore) {
  for (const e of store.all(COL.journal)) {
    const d = round2(e.items.reduce((s: number, i: any) => s + i.debit, 0))
    const c = round2(e.items.reduce((s: number, i: any) => s + i.credit, 0))
    assert.equal(d, c, `entry ${e.entryNo} not balanced`)
    assert.equal(d, e.totalDebit)
    for (const i of e.items) {
      const acc = i.debitAccountId || i.creditAccountId
      assert.ok(store.doc(COL.accounts, acc), `entry ${e.entryNo} uses missing account ${acc}`)
    }
  }
  const stockValue = round2(
    store.all(COL.products).reduce((s, p) => {
      const st = stockState(p.id, p)
      return s + Math.max(st.quantity, 0) * st.purchasePrice
    }, 0),
  )
  assert.equal(balance(store, ACC.inventory), stockValue, 'inventory account must equal stock value')
}

export async function seedProduct(act: ReturnType<typeof setup>['act'], data: Record<string, unknown>) {
  const res = await act('product.save', {
    code: 'P1',
    name: 'خاتم فضة',
    itemType: 'SILVER',
    purchasePrice: 50,
    salePrice: 150,
    ...data,
  })
  return res.id as string
}
