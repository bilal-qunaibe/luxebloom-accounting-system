import { ACC, expenseAccountId, moneyAccount, normalizeExpenseCategory, partnerAccountId } from './accounts.js'
import { COL, CURRENCY_LABEL, fail, iso, notFound, round2, toBase, type Ctx } from './core.js'
import { readRates } from './inventory.js'
import { docDate, reserveNumber, writeEntry } from './journal.js'
import type { ExpenseCreate, PartnerTx, PartyPayment } from './schemas.js'
import type { Reader, Store } from '../store.js'

// العمليات النقدية: المصاريف، حركات الشركاء، دفعات العملاء والموردين

const currencyNote = (amount: number, currency: string, rate: number) =>
  currency === 'ILS' ? '' : ` (${amount} ${CURRENCY_LABEL[currency as 'USD']} × ${rate})`

// ---------- المصاريف ----------

export async function prepareExpense(r: Reader, input: ExpenseCreate) {
  const rates = await readRates(r)
  const { base, rate } = toBase(input.amount, input.currency, input.rate, rates)
  return { amount: base, rate, category: normalizeExpenseCategory(input.category) }
}

export async function createExpense(store: Store, ctx: Ctx, input: ExpenseCreate) {
  return store.runTransaction(async tx => {
    const prep = await prepareExpense(tx, input)
    const year = ctx.now.getUTCFullYear()
    const num = await reserveNumber(tx, 'expense', 'EXP', year)
    const je = await reserveNumber(tx, 'journal', 'JE', year, 5)

    const id = tx.newId(COL.expenses)
    const createdAt = docDate(ctx, input.date)
    const entryId = writeEntry(tx, ctx, je.value, {
      description: `مصروف: ${input.title}${currencyNote(input.amount, input.currency, prep.rate)}`,
      reference: num.value,
      date: createdAt,
      source: { type: 'expense', id },
      lines: [
        { accountId: expenseAccountId(prep.category), debit: prep.amount, description: prep.category },
        { accountId: moneyAccount(input.paymentMethod), credit: prep.amount, description: 'المدفوع' },
      ],
    })

    tx.set(COL.expenses, id, {
      number: num.value,
      title: input.title,
      amount: prep.amount,
      currency: input.currency,
      originalAmount: round2(input.amount),
      rate: prep.rate,
      category: prep.category,
      paymentMethod: input.paymentMethod,
      date: createdAt.slice(0, 10),
      notes: input.notes,
      createdAt,
      recordedAt: iso(ctx.now),
      status: 'CONFIRMED',
      journalEntryId: entryId,
      origin: ctx.origin,
      createdBy: ctx.uid,
    })

    num.commit(tx)
    je.commit(tx)
    return { id, number: num.value, amount: prep.amount }
  })
}

// ---------- الشركاء ----------

export async function preparePartnerTx(r: Reader, input: PartnerTx) {
  const partner = await r.get(COL.partners, input.partnerId)
  if (!partner.exists) notFound('الشريك غير موجود')
  const rates = await readRates(r)
  const { base, rate } = toBase(input.amount, input.currency, input.rate, rates)
  return { partner: { id: partner.id, name: String(partner.data.name || '') }, amount: base, rate }
}

export async function createPartnerTx(store: Store, ctx: Ctx, input: PartnerTx) {
  return store.runTransaction(async tx => {
    const prep = await preparePartnerTx(tx, input)
    const year = ctx.now.getUTCFullYear()
    const num = await reserveNumber(tx, 'partnerTx', 'PTX', year)
    const je = await reserveNumber(tx, 'journal', 'JE', year, 5)

    const id = tx.newId(COL.partnerTx)
    const createdAt = docDate(ctx, input.date)
    const partnerAcc = partnerAccountId(prep.partner.id)
    const cash = moneyAccount(input.paymentMethod)
    const isIn = input.kind === 'CONTRIBUTION'
    const label = isIn ? `إيداع من الشريك ${prep.partner.name}` : `دفعة للشريك ${prep.partner.name}`

    const entryId = writeEntry(tx, ctx, je.value, {
      description: `${label}${currencyNote(input.amount, input.currency, prep.rate)}`,
      reference: num.value,
      date: createdAt,
      source: { type: 'partnerTx', id },
      lines: isIn
        ? [
            { accountId: cash, debit: prep.amount },
            { accountId: partnerAcc, credit: prep.amount },
          ]
        : [
            { accountId: partnerAcc, debit: prep.amount },
            { accountId: cash, credit: prep.amount },
          ],
    })

    tx.set(COL.partnerTx, id, {
      number: num.value,
      partnerId: prep.partner.id,
      partnerName: prep.partner.name,
      kind: input.kind,
      amount: prep.amount,
      currency: input.currency,
      originalAmount: round2(input.amount),
      rate: prep.rate,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdAt,
      recordedAt: iso(ctx.now),
      status: 'CONFIRMED',
      journalEntryId: entryId,
      origin: ctx.origin,
      createdBy: ctx.uid,
    })

    num.commit(tx)
    je.commit(tx)
    return { id, number: num.value, amount: prep.amount }
  })
}

// ---------- دفعات العملاء والموردين ----------

type PartyKind = 'customer' | 'supplier'

const PARTY = {
  customer: { col: COL.customers, payCol: COL.customerPayments, prefix: 'RCV', label: 'قبض من العميل', missing: 'العميل غير موجود' },
  supplier: { col: COL.suppliers, payCol: COL.supplierPayments, prefix: 'PAY', label: 'دفع للمورد', missing: 'المورد غير موجود' },
} as const

export async function preparePartyPayment(r: Reader, kind: PartyKind, input: PartyPayment) {
  const cfg = PARTY[kind]
  const party = await r.get(cfg.col, input.partyId)
  if (!party.exists) notFound(cfg.missing)
  const debt = Number(party.data.debt) || 0
  if (input.amount - debt > 0.009) fail(`المبلغ أكبر من الدين المسجل (${round2(debt)} ₪)`)
  return { party: { id: party.id, name: String(party.data.name || ''), debt }, amount: round2(input.amount) }
}

export async function createPartyPayment(store: Store, ctx: Ctx, kind: PartyKind, input: PartyPayment) {
  const cfg = PARTY[kind]
  return store.runTransaction(async tx => {
    const prep = await preparePartyPayment(tx, kind, input)
    const year = ctx.now.getUTCFullYear()
    const num = await reserveNumber(tx, `${kind}Payment`, cfg.prefix, year)
    const je = await reserveNumber(tx, 'journal', 'JE', year, 5)

    const id = tx.newId(cfg.payCol)
    const createdAt = docDate(ctx, input.date)
    const cash = moneyAccount(input.paymentMethod)
    const entryId = writeEntry(tx, ctx, je.value, {
      description: `${cfg.label} ${prep.party.name}`,
      reference: num.value,
      date: createdAt,
      source: { type: `${kind}Payment`, id },
      lines:
        kind === 'customer'
          ? [
              { accountId: cash, debit: prep.amount },
              { accountId: ACC.receivable, credit: prep.amount },
            ]
          : [
              { accountId: ACC.payable, debit: prep.amount },
              { accountId: cash, credit: prep.amount },
            ],
    })

    tx.set(cfg.payCol, id, {
      number: num.value,
      partyId: prep.party.id,
      partyName: prep.party.name,
      amount: prep.amount,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdAt,
      recordedAt: iso(ctx.now),
      status: 'CONFIRMED',
      journalEntryId: entryId,
      origin: ctx.origin,
      createdBy: ctx.uid,
    })
    tx.update(cfg.col, prep.party.id, { debt: round2(prep.party.debt - prep.amount), updatedAt: iso(ctx.now) })

    num.commit(tx)
    je.commit(tx)
    return { id, number: num.value, amount: prep.amount, remainingDebt: round2(prep.party.debt - prep.amount) }
  })
}
